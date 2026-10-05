"""Validate source splits and mask prompts without cutting off target answers."""

import json
from pathlib import Path

from app.schemas import GroundedAnswer

from .artifacts import file_hash


def read_dataset(directory: Path) -> tuple[dict, dict[str, list[dict]]]:
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("patient_records_used") is not False:
        raise ValueError("Набор должен явно исключать личные медицинские записи.")
    splits = {}
    seen_ids = set()
    source_splits = {}
    for name in ("train", "valid", "test"):
        path = directory / f"{name}.jsonl"
        if file_hash(path) != manifest["files"][name]:
            raise ValueError(f"{path.name} изменён после подготовки данных.")
        rows = [
            json.loads(line)
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if not rows or len(rows) != manifest["counts"][name]:
            raise ValueError(f"Неполная выборка {name}.")
        for row in rows:
            if row["id"] in seen_ids:
                raise ValueError("Повторяющийся идентификатор обучающего примера.")
            seen_ids.add(row["id"])
            previous = source_splits.setdefault(row["source_url"], name)
            if previous != name:
                raise ValueError("Один источник попал в обучение и контрольную выборку.")
            if row["origin"] not in {"public_reference", "synthetic_context"}:
                raise ValueError("Обнаружены данные неизвестного происхождения.")
            messages = row["messages"]
            if [message["role"] for message in messages] != ["system", "user", "assistant"]:
                raise ValueError("Неверный формат диалога.")
            answer = GroundedAnswer.model_validate_json(messages[-1]["content"])
            if set(answer.source_ids) != set(row["source_ids"]):
                raise ValueError("Ответ ссылается на неподходящий источник.")
        splits[name] = rows
    return manifest, splits


def prompt_tokens(tokenizer, messages: list[dict]) -> list[int]:
    return tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        enable_thinking=False,
        return_dict=False,
    )


def tokenize_examples(rows: list[dict], tokenizer, max_length: int) -> tuple[list, dict]:
    examples = []
    excluded = []
    for row in rows:
        messages = row["messages"]
        prefix = prompt_tokens(tokenizer, messages[:-1])
        complete = tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=False,
            enable_thinking=False,
            return_dict=False,
        )
        if complete[: len(prefix)] != prefix or len(complete) <= len(prefix):
            raise ValueError("Шаблон модели не совпал с маской ответа. Обучение остановлено.")
        if len(complete) > max_length:
            excluded.append(row["id"])
            continue
        examples.append((complete, len(prefix)))
    if not examples:
        raise ValueError("После проверки длины не осталось полных примеров.")
    return examples, {"used": len(examples), "excluded_too_long": excluded}
