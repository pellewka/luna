"""Small, auditable SQLite FTS5 index, with optional local vector embeddings."""

import hashlib
import json
import math
import re
import sqlite3
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from .schemas import Source

ALLOWED_HOSTS = {"womenshealth.gov", "medlineplus.gov", "www.nhs.uk", "dailymed.nlm.nih.gov"}
STOP_WORDS = set(
    "а и или но что это как почему ли для при мне меня мой моя мои его ее вы я у с со в во на из к по о об от до не нет да есть нужно можно делать такое какие какой какая когда если же уже очень расскажи пожалуйста про более быть врач врача здоровье вопрос ответ объясни означает значит узнать привет здравствуйте здравствуй добрый день вечер утро the a an and or what how why is are of to in for my me about does do can please explain hello hi".split()
)
INDEX_SCHEMA = "2"


@dataclass(frozen=True)
class Article:
    id: str
    title: str
    keywords: str
    text: str
    url: str
    publisher: str
    checked_at: str
    language: str = "ru"
    document_id: str = ""

    def source(self) -> Source:
        return Source(
            id=self.id,
            title=self.title,
            url=self.url,
            publisher=self.publisher,
            checked_at=self.checked_at,
            language=self.language,
        )


def corpus_paths(path: Path) -> list[Path]:
    imported = path.parent / "medlineplus.json"
    return [path, imported] if imported.exists() and imported != path else [path]


def corpus_digest(path: Path) -> str:
    digest = hashlib.sha256()
    for source in corpus_paths(path):
        digest.update(source.name.encode())
        digest.update(b"\0")
        digest.update(source.read_bytes())
    return digest.hexdigest()


def load_articles(path: Path) -> list[Article]:
    articles = []
    for source in corpus_paths(path):
        payload = json.loads(source.read_text(encoding="utf-8"))
        articles.extend(Article(**item) for item in payload["articles"])
    if not articles or len({item.id for item in articles}) != len(articles):
        raise ValueError("Corpus must contain articles with unique IDs")
    for item in articles:
        url = urlparse(item.url)
        if (
            url.scheme != "https"
            or url.hostname not in ALLOWED_HOSTS
            or url.username
            or url.password
        ):
            raise ValueError(f"Unapproved source: {item.id}")
        if not item.text.strip() or len(item.text) > 3000:
            raise ValueError(f"Invalid article length: {item.id}")
        if item.language not in {"ru", "en"}:
            raise ValueError(f"Unsupported language: {item.id}")
    return articles


def build_index(
    corpus: Path, database: Path, vectors: list[list[float]] | None = None, model: str = ""
) -> int:
    """Build separately and atomically replace; never leave a half-written index."""
    articles = load_articles(corpus)
    if vectors is not None:
        dimensions = len(vectors[0]) if vectors else 0
        if (
            len(vectors) != len(articles)
            or not dimensions
            or any(
                len(vector) != dimensions
                or not all(math.isfinite(x) for x in vector)
                or not any(vector)
                for vector in vectors
            )
        ):
            raise ValueError("Invalid embedding batch")
    database.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=database.parent, suffix=".building", delete=False) as file:
        temporary = Path(file.name)
    try:
        with sqlite3.connect(temporary) as connection:
            connection.executescript("""
                CREATE TABLE articles (id TEXT PRIMARY KEY, title TEXT, keywords TEXT, text TEXT, url TEXT, publisher TEXT, checked_at TEXT, language TEXT, document_id TEXT, vector TEXT);
                CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED, title, keywords, text, tokenize='unicode61');
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT);
            """)
            for index, article in enumerate(articles):
                values = tuple(vars(article).values())
                vector = json.dumps(vectors[index]) if vectors is not None else None
                connection.execute(
                    "INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (*values, vector)
                )
                connection.execute(
                    "INSERT INTO search VALUES (?, ?, ?, ?)",
                    (article.id, article.title, article.keywords, article.text),
                )
            metadata = {
                "embedding_model": model if vectors is not None else "",
                "corpus_sha256": corpus_digest(corpus),
                "schema_version": INDEX_SCHEMA,
            }
            connection.executemany("INSERT INTO metadata VALUES (?, ?)", metadata.items())
        temporary.replace(database)
    finally:
        temporary.unlink(missing_ok=True)
    return len(articles)


def query_terms(text: str) -> list[str]:
    words = re.findall(r"[a-zа-я0-9]+", text.lower().replace("ё", "е"))
    # Prefix search handles common Russian endings without downloading a stemmer.
    return list(
        dict.fromkeys(
            word[: max(4, len(word) - 2)]
            if len(word) > 5 and re.fullmatch(r"[а-я]+", word)
            else word
            for word in words
            if word not in STOP_WORDS and len(word) > 2
        )
    )[:30]


def cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    denominator = math.sqrt(sum(x * x for x in left) * sum(x * x for x in right))
    return sum(a * b for a, b in zip(left, right)) / denominator if denominator else 0.0


class KnowledgeBase:
    def __init__(self, path: Path):
        self.path = path
        self._vector_stamp: tuple[int, int, int] | None = None
        self._vectors: list[tuple[str, list[float]]] = []

    def info(self) -> dict:
        with sqlite3.connect(self.path) as connection:
            metadata = dict(connection.execute("SELECT key, value FROM metadata"))
            count, embedded = connection.execute(
                "SELECT count(*), count(vector) FROM articles"
            ).fetchone()
            if metadata.get("schema_version") == INDEX_SCHEMA:
                documents = connection.execute(
                    "SELECT count(DISTINCT coalesce(nullif(document_id, ''), id)) FROM articles"
                ).fetchone()[0]
            else:
                documents = count
        return {**metadata, "articles": count, "documents": documents, "embedded": embedded}

    def vectors(self) -> list[tuple[str, list[float]]]:
        stat = self.path.stat()
        stamp = (stat.st_ino, stat.st_mtime_ns, stat.st_size)
        if stamp != self._vector_stamp:
            with sqlite3.connect(self.path) as connection:
                self._vectors = [
                    (item_id, json.loads(value))
                    for item_id, value in connection.execute(
                        "SELECT id, vector FROM articles WHERE vector IS NOT NULL"
                    )
                ]
            self._vector_stamp = stamp
        return self._vectors

    def get(self, ids: list[str]) -> list[Article]:
        if not ids:
            return []
        with sqlite3.connect(self.path) as connection:
            connection.row_factory = sqlite3.Row
            placeholders = ",".join("?" for _ in ids)
            rows = connection.execute(
                f"SELECT * FROM articles WHERE id IN ({placeholders})", ids
            ).fetchall()
        articles = {
            row["id"]: Article(**{key: row[key] for key in Article.__dataclass_fields__})
            for row in rows
        }
        return [articles[article_id] for article_id in ids if article_id in articles]

    def search(
        self, query: str, vector: list[float] | None = None, limit: int = 3
    ) -> list[Article]:
        terms = query_terms(query)
        if not terms or limit < 1:
            return []
        with sqlite3.connect(self.path) as connection:
            connection.row_factory = sqlite3.Row
            expression = " OR ".join(
                f'"{term}"*' if re.fullmatch(r"[а-я]+", term) else f'"{term}"' for term in terms
            )
            matches = connection.execute(
                "SELECT id FROM search WHERE search MATCH ? ORDER BY bm25(search, 0, 4, 3, 1) LIMIT 48",
                (expression,),
            ).fetchall()
        scores = {row["id"]: 1 / (30 + rank) for rank, row in enumerate(matches)}
        if vector:
            semantic = sorted(
                ((item_id, cosine(vector, embedding)) for item_id, embedding in self.vectors()),
                key=lambda pair: pair[1],
                reverse=True,
            )
            for rank, (article_id, similarity) in enumerate(semantic[:48]):
                # A conservative starting value, to calibrate on the evaluation set.
                if similarity >= 0.55:
                    scores[article_id] = scores.get(article_id, 0) + 1 / (30 + rank)
        ranked = sorted(scores, key=lambda article_id: scores[article_id], reverse=True)
        selected = []
        documents = set()
        for article in self.get(ranked):
            document = article.document_id or article.id
            if document not in documents:
                selected.append(article)
                documents.add(document)
            if len(selected) >= limit:
                break
        return selected
