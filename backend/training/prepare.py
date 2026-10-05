"""Build supervised examples from the bundled public corpus, split by source URL."""

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

from app.config import Settings
from app.knowledge import load_articles
from app.prompts import SYSTEM_PROMPT, user_prompt
from app.schemas import GroundedAnswer

from .artifacts import DATA_PATH, ROOT, file_hash, write_json


def source_split(url: str) -> str:
    bucket = int(hashlib.sha256(("luna-training-v1:" + url).encode()).hexdigest()[:8], 16) % 10
    return "test" if bucket == 0 else "valid" if bucket == 1 else "train"


def messages_for(
    question: str, materials: list[dict], *, labs: str = "", diary: str = ""
) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": user_prompt(
                question, json.dumps(materials, ensure_ascii=False), diary, labs
            ),
        },
    ]


def example(identifier: str, question: str, article, answer: str, **context) -> dict:
    # Per-example source IDs teach citing the supplied document instead of memorizing an ID.
    source_id = "source-" + hashlib.sha256(identifier.encode()).hexdigest()[:12]
    material = {"id": source_id, "title": article.title, "text": article.text}
    target = GroundedAnswer(answer=answer, source_ids=[source_id])
    return {
        "id": identifier,
        "source_url": article.url,
        "language": article.language,
        "source_ids": [source_id],
        "origin": "public_reference" if not context else "synthetic_context",
        "messages": [
            *messages_for(question, [material], **context),
            {"role": "assistant", "content": target.model_dump_json()},
        ],
    }


def prepare(destination: Path = DATA_PATH) -> dict:
    knowledge_path = ROOT / "knowledge"
    aliases = json.loads((knowledge_path / "topic_aliases.json").read_text(encoding="utf-8"))
    articles = load_articles(Settings().corpus)
    selected = []
    seen_text = set()
    for article in articles:
        slug = Path(urlparse(article.url).path).stem
        if article.language == "en" and slug not in aliases:
            continue
        fingerprint = hashlib.sha256(" ".join(article.text.split()).encode()).hexdigest()
        if fingerprint in seen_text or not 20 <= len(article.text) <= 2200:
            continue
        if re.search(r"https?://|\d+\s*(?:мг|мкг|mg|таблет)", article.text, re.I):
            continue
        seen_text.add(fingerprint)
        question = (
            "Что говорится в этой справке? Ответь по-русски и укажи её идентификатор."
            if article.language == "ru"
            else "What does this reference explain? Answer in English using only the supplied text and cite its ID."
        )
        selected.append(example(article.id, question, article, article.text))

    by_id = {article.id: article for article in articles}
    cases = [
        (
            "missing-units",
            "lab-results",
            "Можно сказать, что мой анализ в норме?",
            "Результат внесён без единиц и референса. Численное сравнение не выполнено.",
            "Без единиц измерения и референса из вашего бланка оценить положение результата относительно интервала нельзя. Внесите эти сведения. Даже попадание в интервал само по себе не исключает заболевание.",
        ),
        (
            "different-labs",
            "lab-results",
            "По этим анализам мне стало лучше?",
            "Повторные результаты получены в разных лабораториях. Численная динамика не рассчитана.",
            "Методы и референсы лабораторий могут различаться. По этим записям нельзя уверенно оценить динамику или улучшение здоровья. Обсудите сопоставимость результатов с врачом.",
        ),
        (
            "inside-range",
            "lab-results",
            "Раз результат внутри референса, значит я здорова?",
            "Значение находится внутри введённого пользователем интервала. Жалобы и условия сдачи неизвестны.",
            "Попадание в референсный интервал не исключает заболевание. Результат оценивают вместе с жалобами, историей и другими данными. Если симптомы сохраняются, обсудите их с врачом.",
        ),
        (
            "outside-range",
            "lab-results",
            "Какой у меня диагноз по этому результату?",
            "Результат выше введённого референса. Применимость интервала к пользователю не установлена.",
            "Одно значение вне референса не устанавливает диагноз. Нужно проверить подходящий вам интервал, условия сдачи, симптомы и принимаемые препараты. Причину изменения определяют с врачом.",
        ),
        (
            "ferritin-cause",
            "lab-ferritin",
            "Высокий ферритин доказывает избыток железа?",
            "Ферритин выше введённого референса. Другие результаты не предоставлены.",
            "Ферритин может изменяться при воспалении и других состояниях. По одному показателю нельзя доказать избыток железа или выбрать лечение. Его оценивают вместе с другими данными.",
        ),
        (
            "prolactin-drug",
            "lab-prolactin",
            "Значит пролактин изменился точно из-за моего лекарства?",
            "Пролактин изменился после начала приёма препарата. Условия сдачи и другие причины неизвестны.",
            "Некоторые лекарства могут влиять на пролактин, но совпадение по времени не устанавливает причину. Важны условия сдачи, жалобы и другие сведения. Не отменяйте препарат самостоятельно; обсудите изменения с врачом.",
        ),
    ]
    for identifier, source_id, question, summary, answer in cases:
        selected.append(example(identifier, question, by_id[source_id], answer, labs=summary))

    splits = {name: [] for name in ("train", "valid", "test")}
    for item in selected:
        splits[source_split(item["source_url"])].append(item)
    if any(not rows for rows in splits.values()):
        raise ValueError("Для разделения по источникам недостаточно материалов.")
    destination.mkdir(parents=True, exist_ok=True)
    for split, rows in splits.items():
        path = destination / f"{split}.jsonl"
        path.write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8"
        )
    manifest = {
        "purpose": "Supervised educational answers with source IDs; not clinical diagnosis training",
        "clinical_review": "pending",
        "patient_records_used": False,
        "split_method": "SHA256 of source URL; all chunks of a document stay in the same split",
        "languages": dict(Counter(item["language"] for item in selected)),
        "source_documents": len({item["source_url"] for item in selected}),
        "counts": {split: len(rows) for split, rows in splits.items()},
        "files": {split: file_hash(destination / f"{split}.jsonl") for split in splits},
        "sources": {
            name: file_hash(knowledge_path / name)
            for name in ("articles.json", "medlineplus.json", "topic_aliases.json")
        },
        "terms": json.loads((knowledge_path / "medlineplus.json").read_text(encoding="utf-8")).get(
            "terms"
        ),
        "note": "English references retain English targets; Russian references retain Russian targets. Synthetic contexts are not patient records.",
    }
    write_json(destination / "manifest.json", manifest)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Подготовить открытые данные для дообучения")
    parser.add_argument("--output", type=Path, default=DATA_PATH)
    args = parser.parse_args()
    print(json.dumps(prepare(args.output), ensure_ascii=False, indent=2))
