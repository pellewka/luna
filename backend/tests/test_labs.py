import asyncio
from dataclasses import replace
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.diary import DiaryContext
from app.knowledge import KnowledgeBase
from app.lab_analysis import (
    LabContext,
    LabRecord,
    cycle_day_on,
    describe_comparison,
    describe_labs,
    parse_number,
    parse_reference,
)
from app.main import create_app
from app.model import LocalModel
from app.schemas import ChatRequest, GroundedAnswer, Usage
from app.service import answer_question


def lab(**changes):
    return LabRecord(
        **{
            "title": "Ферритин",
            "date": "2026-10-03",
            "value": "12,5",
            "unit": "нг/мл",
            "reference": "15–100",
            "category": "biochemistry",
            "origin": "manual",
            "laboratory": "Лаборатория А",
            **changes,
        }
    )


def labs(*results):
    return LabContext(as_of="2026-10-05", results=list(results))


@pytest.mark.parametrize(
    "reference,value,expected",
    [
        ("0,4–4,0", "0,4", "в пределах"),
        ("0.4-4.0", "4,00", "в пределах"),
        ("0,4–4,0", "4,01", "выше"),
        ("0,4–4,0", "0.39", "ниже"),
        ("< 5", "5", "выше"),
        ("≤ 5", "5", "в пределах"),
        ("> 5", "5", "ниже"),
        (">=5", "5", "в пределах"),
    ],
)
def test_reference_boundaries_are_exact(reference, value, expected):
    assert parse_reference(reference).describe(parse_number(value)).startswith(expected)


@pytest.mark.parametrize("reference", ["5–1", "норма", "1–5; лютеиновая: 7–20", "1–5 мг/л", "NaN"])
def test_ambiguous_references_are_not_guessed(reference):
    assert parse_reference(reference) is None


def test_missing_units_ranges_and_censored_values_do_not_become_normal():
    for result, expected in [
        (lab(value="< 0,1"), "численно не оцениваю"),
        (lab(value="Отрицательно"), "численно не оцениваю"),
        (lab(unit=""), "Не указаны единицы"),
        (lab(reference=""), "Нет референса"),
        (lab(reference="фаза 1: 1–5; фаза 2: 6–10"), "Референс не распознан"),
    ]:
        summary = describe_labs(labs(result), None, "Разбери анализы")
        assert expected in summary
        assert "в пределах введённого референса" not in summary.lower()


def test_comparison_requires_matching_units_laboratory_and_reference():
    current = lab()
    previous = lab(date="2026-09-01", value="10,2")
    assert "Разница: +2.3 нг/мл" in describe_comparison(current, previous)
    for changes in [
        {"unit": "мкг/л"},
        {"laboratory": "Другая лаборатория"},
        {"laboratory": ""},
        {"reference": "10–80"},
        {"value": "< 10"},
        {"category": "hormones"},
        {"date": current.date},
    ]:
        assert "Разница:" not in describe_comparison(current, previous.model_copy(update=changes))


def test_cycle_day_uses_sampling_date_and_only_consented_diary():
    diary = DiaryContext(as_of="2026-10-05", periods=[{"start": "2026-09-29", "end": "2026-10-02"}])
    assert cycle_day_on(date(2026, 10, 3), diary) == 5
    assert cycle_day_on(date(2026, 9, 28), diary) is None
    assert cycle_day_on(date(2026, 10, 3), None) is None
    assert "день цикла 5" in describe_labs(labs(lab()), diary, "Разбери анализы")
    assert "день цикла 5" not in describe_labs(labs(lab()), None, "Разбери анализы")


def test_lab_api_requires_separate_consent_and_rejects_demo_and_private_fields(settings):
    body = {"message": "Разбери мои анализы", "labs": labs(lab()).model_dump(mode="json")}
    with TestClient(create_app(settings)) as client:
        assert client.post("/v1/chat", json=body).status_code == 422
        body["diary_consent"] = True
        assert client.post("/v1/chat", json=body).status_code == 422
        body["labs_consent"] = True
        response = client.post("/v1/chat", json=body)
        assert response.status_code == 200
        answer = response.json()
        assert answer["labs_used"] and not answer["diary_used"]
        assert "Ниже введённого референса" in answer["answer"]
        assert "lab-results" in [source["id"] for source in answer["sources"]]
        body["labs"]["results"][0]["origin"] = "demo"
        assert client.post("/v1/chat", json=body).status_code == 422
        body["labs"]["results"][0]["origin"] = "manual"
        body["labs"]["results"][0]["attachment"] = {"name": "private-file"}
        assert client.post("/v1/chat", json=body).status_code == 422


def test_lab_dates_and_size_are_bounded():
    for results in [[lab(date="2026-10-06")], [lab(date="2025-10-04")], [lab()] * 31]:
        with pytest.raises(ValidationError):
            labs(*results)
    with pytest.raises(ValidationError):
        ChatRequest(
            message="Разбери данные",
            labs=labs(lab()),
            labs_consent=True,
            diary={"as_of": "2026-10-04"},
            diary_consent=True,
        )


def test_latest_results_are_selected_and_requested_marker_has_priority():
    records = [lab(title=f"Показатель {index}") for index in range(10)]
    records.append(lab(title="Ферритин", date="2026-09-01", value="9"))
    summary = describe_labs(labs(*records), None, "Объясни ферритин")
    assert "по 8 показателям" in summary
    assert summary.index("Ферритин ·") < summary.index("Показатель 0 ·")
    assert "Показатель 9 ·" not in summary


@pytest.mark.parametrize(
    "generated",
    [
        "Ваш показатель в норме: нормальный референс составляет 1–99.",
        "Ваша задержка вызвана препаратом спиронолактон.",
    ],
)
def test_unsupported_numbers_and_causation_use_calculated_fallback(settings, generated):
    class UnreliableModel:
        async def generate(self, messages):
            assert "СВОДКА АНАЛИЗОВ" in messages[-1]["content"]
            return GroundedAnswer(answer=generated, source_ids=["lab-results"]), Usage()

    result = asyncio.run(
        answer_question(
            ChatRequest(message="Разбери мои анализы", labs=labs(lab()), labs_consent=True),
            replace(settings, generation_enabled=True),
            KnowledgeBase(settings.database),
            UnreliableModel(),
        )
    )
    assert result.mode == "reference" and result.labs_used
    assert generated not in result.answer
    assert "12,5" in result.answer


def test_grounded_model_answer_preserves_calculated_summary(settings):
    class GroundedModel:
        async def generate(self, messages):
            return GroundedAnswer(
                answer="Ферритин помогает оценивать запасы железа. Обсудите с врачом применимость референса и другие результаты.",
                source_ids=["lab-ferritin"],
            ), Usage()

    result = asyncio.run(
        answer_question(
            ChatRequest(message="Объясни ферритин", labs=labs(lab()), labs_consent=True),
            replace(settings, generation_enabled=True),
            KnowledgeBase(settings.database),
            GroundedModel(),
        )
    )
    assert result.mode == "llm" and result.labs_used
    assert "Ниже введённого референса" in result.answer
    assert any(source.id == "lab-ferritin" for source in result.sources)


@pytest.mark.parametrize("names,expected", [(["qwen3:4b"], "ready"), ([], "missing")])
def test_health_checks_model_installation_without_running_inference(
    settings, monkeypatch, names, expected
):
    original_client = httpx.AsyncClient

    def respond(request):
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": name} for name in names]})

    transport = httpx.MockTransport(respond)
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: original_client(transport=transport, **kwargs)
    )
    status = asyncio.run(LocalModel(replace(settings, generation_enabled=True)).status())
    assert status["state"] == expected
