"""Compare held-out answers before and after LoRA. This is not a clinical validation."""

import argparse
import gc
import re
from pathlib import Path

from app.answer_validation import validate_answer
from app.mlx_runtime import generate_text
from app.schemas import GroundedAnswer

from .artifacts import ADAPTER_PATH, BASE_PATH, DATA_PATH, validate_adapter, write_json
from .dataset import read_dataset
from .model_setup import check_hardware


def check_reply(text: str, example: dict) -> dict:
    result = {"json": False, "citations": False, "output_checks": False, "language": False}
    try:
        answer = GroundedAnswer.model_validate_json(text)
        result["json"] = True
        result["citations"] = set(answer.source_ids).issubset(example["source_ids"])
        letters = re.findall(r"[a-zа-яё]", answer.answer, re.I)
        cyrillic = len(re.findall(r"[а-яё]", answer.answer, re.I)) / max(len(letters), 1)
        result["language"] = cyrillic > 0.6 if example["language"] == "ru" else cyrillic < 0.2
        validate_answer(
            answer, set(example["source_ids"]), has_labs=example["origin"] == "synthetic_context"
        )
        result["output_checks"] = True
    except (ValueError, TypeError):
        pass
    result["accepted"] = all(result.values())
    return result


def passes_comparison(baseline: dict, candidate: dict) -> bool:
    for language in ("ru", "en"):
        before = [row for row in baseline["responses"] if row["language"] == language]
        after = [row for row in candidate["responses"] if row["language"] == language]
        if not after or len(before) != len(after):
            return False
        accepted_before = sum(row["checks"]["accepted"] for row in before)
        accepted_after = sum(row["checks"]["accepted"] for row in after)
        if accepted_after / len(after) < 0.8 or accepted_after < accepted_before:
            return False
    return True


def evaluate_adapter(base: Path, adapter: Path, data: Path) -> dict:
    check_hardware()
    training = validate_adapter(base, adapter, check_base=True)
    manifest, splits = read_dataset(data)
    if training["dataset_files"] != manifest["files"]:
        raise ValueError("Оценка должна использовать исходную отложенную выборку этого обучения.")
    import mlx.core as mx
    from mlx_lm import load

    report = {
        "status": "running",
        "adapter_sha256": training["adapter_sha256"],
        "base_sha256": training["base_sha256"],
        "test_sha256": manifest["files"]["test"],
        "clinical_validation": False,
        "meaning": "JSON, source IDs, language and conservative output checks only. Does not measure medical correctness.",
        "results": {},
    }
    report_path = adapter / "evaluation.json"
    write_json(report_path, report)
    for name, path in (("base", None), ("trained", str(adapter))):
        model, tokenizer = load(str(base), adapter_path=path, trust_remote_code=False)
        model.eval()
        responses = []
        for index, example in enumerate(splits["test"], 1):
            text, usage = generate_text(model, tokenizer, example["messages"][:-1])
            checks = check_reply(text, example)
            responses.append(
                {
                    "id": example["id"],
                    "language": example["language"],
                    "answer": text,
                    "checks": checks,
                    "usage": usage.model_dump(),
                    "reference": example["messages"][-1]["content"],
                }
            )
            print(
                f"{name}: {index}/{len(splits['test'])}; формат и ограничения: {checks['accepted']}",
                flush=True,
            )
        report["results"][name] = {
            "accepted": sum(item["checks"]["accepted"] for item in responses),
            "total": len(responses),
            "responses": responses,
        }
        write_json(report_path, report)
        del model, tokenizer
        gc.collect()
        mx.clear_cache()
    baseline = report["results"]["base"]
    candidate = report["results"]["trained"]
    passed = passes_comparison(baseline, candidate)
    report["status"] = "passed" if passed else "needs_review"
    write_json(report_path, report)
    print(
        f"До обучения: {baseline['accepted']}/{baseline['total']}; после: {candidate['accepted']}/{candidate['total']}."
    )
    print("Это техническая проверка, а не доказательство медицинской точности.")
    if not passed:
        raise ValueError(
            "Адаптер не прошёл порог проверки; он не будет подключён. Ответы сохранены в evaluation.json."
        )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Сравнить исходную и дообученную модели")
    parser.add_argument("--base", type=Path, default=BASE_PATH)
    parser.add_argument("--adapter", type=Path, default=ADAPTER_PATH)
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    args = parser.parse_args()
    try:
        evaluate_adapter(args.base, args.adapter, args.data)
    except (ValueError, OSError, KeyError) as failure:
        raise SystemExit(str(failure)) from None
