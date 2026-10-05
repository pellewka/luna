import json
import re

import httpx
from pydantic import ValidationError

from .answer_validation import validate_answer
from .config import Settings
from .diary import describe_diary, medication_sources, mentioned_drug_sources
from .knowledge import Article, KnowledgeBase
from .lab_analysis import describe_labs, lab_source_ids, selected_results
from .model import RETRIEVAL_INSTRUCTION, LocalModel, ModelUnavailable
from .prompts import SYSTEM_PROMPT, user_prompt
from .safety import safety_response
from .schemas import ChatRequest, ChatResponse


def reference_answer(
    articles: list[Article],
    retrieval: str,
    notice: str,
    diary_summary: str = "",
    topic: Article | None = None,
    labs_summary: str = "",
) -> ChatResponse:
    selected = articles if diary_summary or labs_summary else articles[:2]
    answer = "\n\n".join(part for part in [labs_summary, diary_summary] if part)
    if not answer:
        answer = "\n\n".join(f"{article.title}\n{article.text}" for article in selected)
    elif topic and not topic.id.startswith("drug-") and topic.language == "ru":
        answer += f"\n\nПо теме вопроса: {topic.title}\n{topic.text}"
    if any(article.language == "en" for article in selected):
        notice += " Часть источников на английском. Для их перевода нужна работающая модель."
    return ChatResponse(
        answer=answer,
        sources=[article.source() for article in selected],
        mode="reference",
        retrieval=retrieval,
        notice=notice,
        diary_used=bool(diary_summary),
        labs_used=bool(labs_summary),
    )


def bounded_context(articles: list[Article], limit: int = 4800) -> str:
    selected = []
    remaining = limit
    for article in articles:
        item = {"id": article.id, "title": article.title, "text": article.text}
        size = len(json.dumps(item, ensure_ascii=False))
        if size <= remaining:
            selected.append(item)
            remaining -= size
    return json.dumps(selected, ensure_ascii=False)


def model_failure_notice(failure: Exception, settings: Settings) -> str:
    if isinstance(failure, (httpx.TimeoutException, TimeoutError)):
        return "Модель не успела ответить. Расчёт по записям и справочные материалы доступны ниже."
    if isinstance(failure, ModelUnavailable):
        return str(failure)
    if isinstance(failure, httpx.ConnectError):
        return "Ollama недоступна. Запустите её на компьютере с сервером и проверьте подключение."
    if isinstance(failure, httpx.HTTPStatusError) and failure.response.status_code == 404:
        return f"Модель {settings.chat_model} не найдена в Ollama. Проверьте настройки подключения."
    return "Ответ модели не прошёл проверку. Показываю расчёт по записям и справочные материалы."


async def answer_question(
    request: ChatRequest, settings: Settings, knowledge: KnowledgeBase, model: LocalModel
) -> ChatResponse:
    safety = safety_response(request.message)
    if safety:
        return ChatResponse(answer=safety, mode="safety")

    # Carry forward the previous question only for explicit conversational follow-ups.
    query = request.message
    if re.match(r"^(а |и |почему|как это|что это|подробнее)", query.lower()):
        previous = next(
            (item.content for item in reversed(request.history) if item.role == "user"), ""
        )
        query = f"{query} {previous[:600]}"

    if request.labs and request.labs.results:
        titles = [result.title for result in selected_results(request.labs, query)[:3]]
        query = f"{query} {' '.join(titles)}"

    vector = None
    info = knowledge.info()
    if info["embedded"] and info["embedding_model"] == settings.embed_model:
        try:
            vector = await model.embed(RETRIEVAL_INSTRUCTION + query)
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            pass  # The bundled text index remains usable if Ollama is offline.
    retrieval = "hybrid" if vector else "lexical"
    relevant_drugs = mentioned_drug_sources(query)
    if request.diary:
        relevant_drugs.update(medication_sources(request.diary, query))
    articles = [
        article
        for article in knowledge.search(query, vector, limit=6)
        if not article.id.startswith("drug-") or article.id in relevant_drugs
    ][:3]
    topic = articles[0] if articles else None
    diary_summary = ""
    labs_summary = ""
    if request.diary is not None:
        required = knowledge.get(
            [*medication_sources(request.diary, query), "irregular-periods", "symptom-diary"]
        )
        articles = list({article.id: article for article in [*required, *articles]}.values())[:6]
        diary_summary = describe_diary(request.diary, query, articles)
    if request.labs is not None:
        labs_summary = describe_labs(request.labs, request.diary, request.message)
        required = knowledge.get(["lab-results", *lab_source_ids(request.labs, request.message)])
        articles = list({article.id: article for article in [*required, *articles]}.values())[:6]
        if topic is None:
            topic = next(iter(required), None)
    if not articles:
        return ChatResponse(
            answer="В базе не нашлось подходящего материала. Уточните вопрос или название состояния. Я не буду придумывать ответ.",
            mode="no_evidence",
            retrieval=retrieval,
        )
    if not settings.generation_enabled:
        return reference_answer(
            articles,
            retrieval,
            "Справка из базы знаний. Генерация ИИ отключена.",
            diary_summary,
            topic,
            labs_summary,
        )

    context = bounded_context(articles)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *[{"role": item.role, "content": item.content[:300]} for item in request.history[-2:]],
        {
            "role": "user",
            "content": user_prompt(request.message, context, diary_summary, labs_summary),
        },
    ]
    try:
        generated, usage = await model.generate(messages)
        context_ids = {item["id"] for item in json.loads(context)}
        allowed = {article.id: article for article in articles if article.id in context_ids}
        validate_answer(generated, set(allowed), has_labs=bool(labs_summary))
        source_ids = list(
            dict.fromkeys(
                [
                    *(article.id for article in articles if diary_summary or labs_summary),
                    *generated.source_ids,
                ]
            )
        )
        return ChatResponse(
            answer="\n\n".join(
                part for part in [labs_summary, diary_summary, generated.answer] if part
            ),
            sources=[article.source() for article in articles if article.id in source_ids],
            mode="llm",
            retrieval=retrieval,
            usage=usage,
            diary_used=bool(diary_summary),
            labs_used=bool(labs_summary),
        )
    except (
        httpx.HTTPError,
        ValidationError,
        ValueError,
        KeyError,
        TypeError,
        TimeoutError,
    ) as failure:
        return reference_answer(
            articles,
            retrieval,
            model_failure_notice(failure, settings),
            diary_summary,
            topic,
            labs_summary,
        )
