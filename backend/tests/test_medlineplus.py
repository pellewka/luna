import asyncio
import json

import httpx
import pytest

from app.indexing import embed_articles
from app.knowledge import KnowledgeBase, build_index, corpus_digest, load_articles
from app.medlineplus import parse_topics, split_summary
from app.schemas import ChatRequest
from app.service import answer_question


def sample_feed(summary="&lt;p&gt;Source summary.&lt;/p&gt;"):
    return f"""<health-topics date-generated="10/03/2026 02:30:36" total="2">
    <health-topic id="1" language="English" title="Test" url="https://medlineplus.gov/test.html">
      <full-summary>{summary}</full-summary>
      <also-called>Synonym</also-called>
      <site url="https://medlineplus.gov/ency/article/123.htm" title="COPYRIGHTED SITE TEXT"/>
    </health-topic>
    <health-topic id="2" language="Spanish" title="Prueba" url="https://medlineplus.gov/spanish/test.html">
      <full-summary>Spanish text must not be imported.</full-summary>
    </health-topic></health-topics>""".encode()


def test_import_includes_only_english_summary_with_provenance():
    payload = parse_topics(sample_feed(), {"test": {"title": "Проверка", "keywords": "термин"}})
    assert payload["source_topics"] == 1
    assert payload["snapshot_date"] == "2026-10-03"
    article = payload["articles"][0]
    assert article["text"] == "Source summary."
    assert article["title"] == "Проверка"
    assert "Synonym" in article["keywords"]
    assert article["language"] == "en"
    assert article["url"] == "https://medlineplus.gov/test.html"
    assert "COPYRIGHTED" not in json.dumps(payload)
    assert "Spanish text" not in json.dumps(payload)


def test_import_drops_markup_and_script_contents():
    summary = "&lt;p&gt;Read &lt;a href='https://external.example'&gt;this&lt;/a&gt;.&lt;/p&gt;&lt;script&gt;bad()&lt;/script&gt;"
    article = parse_topics(sample_feed(summary), {})["articles"][0]
    assert article["text"] == "Read this."


def test_chunking_keeps_all_paragraphs_and_bounds():
    paragraphs = [f"Paragraph {index}: " + "word " * 130 for index in range(15)]
    chunks = split_summary("\n\n".join(paragraphs))
    assert len(chunks) > 1
    assert all(0 < len(chunk) <= 1800 for chunk in chunks)
    for paragraph in paragraphs:
        assert any(paragraph.strip() in chunk for chunk in chunks)
    long_text = " ".join(f"term{index:04d}" for index in range(2000))
    long_chunks = split_summary(long_text)
    assert all(len(chunk) <= 1800 for chunk in long_chunks)
    assert " ".join(long_chunks) == long_text


def test_import_rejects_entities_and_untrusted_topic_url():
    with pytest.raises(ValueError):
        parse_topics(b'<!DOCTYPE x [<!ENTITY x "x">]>' + sample_feed(), {})
    with pytest.raises(ValueError):
        parse_topics(sample_feed().replace(b"medlineplus.gov/test", b"other.example/test"), {})


def test_real_snapshot_is_large_attributed_and_deduplicated(settings):
    payload = json.loads((settings.corpus.parent / "medlineplus.json").read_text())
    assert payload["source_topics"] >= 1000
    assert payload["source_topics"] == len(
        {article["document_id"] for article in payload["articles"]}
    )
    assert len(payload["source_sha256"]) == 64
    assert payload["terms"].startswith("https://medlineplus.gov/")
    knowledge = KnowledgeBase(settings.database)
    assert knowledge.info()["documents"] >= 1000
    matches = knowledge.search("беременность", limit=6)
    ids = [article.document_id or article.id for article in matches]
    assert len(ids) == len(set(ids))


def test_imported_corpus_change_changes_startup_digest(settings, tmp_path):
    curated = tmp_path / "articles.json"
    curated.write_bytes(settings.corpus.read_bytes())
    first = corpus_digest(curated)
    imported = tmp_path / "medlineplus.json"
    imported.write_text(json.dumps(parse_topics(sample_feed(), {})))
    assert corpus_digest(curated) != first
    assert len(load_articles(curated)) == len(json.loads(curated.read_text())["articles"]) + 1


def test_english_fallback_is_labelled_and_has_primary_source(settings):
    class Offline:
        async def generate(self, messages):
            raise httpx.ConnectError("offline")

    reply = asyncio.run(
        answer_question(
            ChatRequest(message="Что такое миома матки?"),
            settings,
            KnowledgeBase(settings.database),
            Offline(),
        )
    )
    assert reply.mode == "reference"
    assert "английском" in reply.notice
    assert reply.sources[0].language == "en"
    assert reply.sources[0].url == "https://medlineplus.gov/uterinefibroids.html"


def test_batched_embeddings_resume_after_failure_and_refresh_for_model_digest(settings, tmp_path):
    articles = load_articles(settings.corpus)[:5]
    cache = tmp_path / "cache.sqlite3"
    requests = []
    fail = True
    digest = "first-weights"

    def handler(request):
        nonlocal fail
        if request.url.path == "/api/tags":
            return httpx.Response(
                200, json={"models": [{"name": settings.embed_model, "digest": digest}]}
            )
        inputs = json.loads(request.content)["input"]
        requests.append(inputs)
        if fail and len(requests) == 2:
            fail = False
            raise httpx.ConnectError("interrupted", request=request)
        return httpx.Response(200, json={"embeddings": [[1.0, 0.5] for _ in inputs]})

    transport = httpx.MockTransport(handler)
    with pytest.raises(httpx.ConnectError):
        embed_articles(articles, settings, cache, batch_size=2, transport=transport)
    requests.clear()
    vectors = embed_articles(articles, settings, cache, batch_size=2, transport=transport)
    assert len(vectors) == 5
    assert sum(len(batch) for batch in requests) == 3
    requests.clear()
    embed_articles(articles, settings, cache, transport=transport)
    assert not requests
    digest = "new-weights"
    embed_articles(articles, settings, cache, transport=transport)
    assert sum(len(batch) for batch in requests) == 5


def test_vector_cache_reloads_after_atomic_rebuild(settings):
    articles = load_articles(settings.corpus)
    build_index(settings.corpus, settings.database, [[1.0, 0.0] for _ in articles], "first")
    knowledge = KnowledgeBase(settings.database)
    assert knowledge.vectors()[0][1] == [1.0, 0.0]
    build_index(settings.corpus, settings.database, [[0.0, 1.0] for _ in articles], "second")
    assert knowledge.vectors()[0][1] == [0.0, 1.0]
