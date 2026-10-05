import asyncio
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.diary import DiaryContext
from app.knowledge import KnowledgeBase
from app.main import create_app
from app.schemas import ChatRequest, GroundedAnswer, Usage
from app.service import answer_question


def diary(ingredient="spironolactone", start="2026-09-10"):
    return {
        "as_of": "2026-10-05",
        "periods": [
            {"start": "2026-07-07", "end": "2026-07-11"},
            {"start": "2026-08-04", "end": "2026-08-08"},
            {"start": "2026-09-01", "end": "2026-09-05"},
        ],
        "symptoms": [{"date": "2026-10-01", "symptoms": ["Усталость"], "intensity": 2}],
        "medications": [{"name": "Записанный препарат", "ingredient": ingredient, "start": start}],
    }


class OfflineModel:
    async def generate(self, messages):
        raise httpx.ConnectError("offline")


def ask_diary(
    settings, data, model=None, question="Может ли мой препарат быть связан с задержкой?"
):
    return asyncio.run(
        answer_question(
            ChatRequest(message=question, diary_consent=True, diary=DiaryContext(**data)),
            settings,
            KnowledgeBase(settings.database),
            model or OfflineModel(),
        )
    )


def test_api_requires_consent_and_rejects_unrequested_private_fields(settings):
    with TestClient(create_app(settings)) as client:
        body = {"message": "Разбери дневник", "diary": diary()}
        assert client.post("/v1/chat", json=body).status_code == 422
        body["diary_consent"] = True
        response = client.post("/v1/chat", json=body)
        assert response.status_code == 200
        assert response.json()["diary_used"] is True
        body["diary"]["name"] = "private-name"
        assert client.post("/v1/chat", json=body).status_code == 422


@pytest.mark.parametrize("ingredient", ["spironolactone", "risperidone", "levonorgestrel_ec"])
def test_personal_summary_has_calculated_dates_and_matching_drug_source(settings, ingredient):
    response = ask_diary(settings, diary(ingredient))
    assert response.diary_used
    assert "день цикла — 35" in response.answer
    assert "29.09.2026 прошла 6 дн." in response.answer
    assert "Совпадение по времени не доказывает причину" in response.answer
    expected = "drug-" + ingredient.replace("_", "-")
    assert expected in [source.id for source in response.sources]
    assert not any(
        source.id.startswith("drug-") and source.id != expected for source in response.sources
    )


def test_medication_started_after_expected_date_does_not_explain_onset(settings):
    response = ask_diary(settings, diary(start="2026-10-02"))
    assert "Приём начат уже после расчётной даты" in response.answer


def test_unknown_drug_and_missing_history_do_not_fabricate_relationship(settings):
    data = diary("unknown")
    data["periods"] = data["periods"][-1:]
    response = ask_diary(settings, data)
    assert "хотя бы три" in response.answer
    assert "нет подтверждённой справки" in response.answer
    assert "не означает отсутствия" in response.answer
    assert not any(source.id.startswith("drug-") for source in response.sources)


def test_model_gets_summary_and_cannot_claim_certain_drug_causation(settings):
    class OverconfidentModel:
        async def generate(self, messages):
            context = messages[-1]["content"]
            assert "29.09.2026" in context
            assert "drug-spironolactone" in context
            return GroundedAnswer(
                answer="Ваша задержка вызвана препаратом спиронолактон.",
                source_ids=["drug-spironolactone"],
            ), Usage()

    response = ask_diary(replace(settings, generation_enabled=True), diary(), OverconfidentModel())
    assert response.mode == "reference"
    assert "Ваша задержка вызвана" not in response.answer
    assert response.diary_used


def test_valid_generation_keeps_deterministic_facts_and_sources(settings):
    class GroundedModel:
        async def generate(self, messages):
            return GroundedAnswer(
                answer="Возможную связь стоит обсудить с назначившим препарат врачом.",
                source_ids=["drug-spironolactone"],
            ), Usage(input_tokens=200, output_tokens=30)

    response = ask_diary(replace(settings, generation_enabled=True), diary(), GroundedModel())
    assert response.mode == "llm"
    assert response.diary_used
    assert "день цикла — 35" in response.answer
    assert response.usage.output_tokens == 30


def test_invalid_diary_dates_are_rejected():
    data = diary(start="2027-01-01")
    with pytest.raises(ValueError):
        DiaryContext(**data)
    data = diary()
    data["periods"].append({"start": "2026-09-03", "end": "2026-09-04"})
    with pytest.raises(ValueError):
        DiaryContext(**data)


def test_corpus_change_rebuilds_index_at_startup(settings, tmp_path):
    corpus = json.loads(settings.corpus.read_text())
    corpus["articles"][0]["text"] += " Дополнение для проверки обновления."
    changed = tmp_path / "articles.json"
    changed.write_text(json.dumps(corpus))
    old_hash = KnowledgeBase(settings.database).info()["corpus_sha256"]
    with TestClient(create_app(replace(settings, corpus=changed))) as client:
        assert client.get("/health").json()["knowledge"]["corpus_sha256"] != old_hash
