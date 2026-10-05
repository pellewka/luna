"""Retrieval smoke benchmark, not a clinical validation study."""

import argparse
import asyncio
import json
import time
from pathlib import Path

from app.config import Settings
from app.knowledge import KnowledgeBase
from app.model import RETRIEVAL_INSTRUCTION, LocalModel


async def main() -> None:
    parser = argparse.ArgumentParser(description="Check retrieval, not medical accuracy")
    parser.add_argument("--lexical", action="store_true", help="Run without Ollama")
    parser.add_argument("--report", type=Path, help="Write results to a JSON file")
    args = parser.parse_args()
    config = Settings()
    knowledge = KnowledgeBase(config.database)
    model = LocalModel(config)
    cases = json.loads((config.corpus.parent / "evaluation.json").read_text(encoding="utf-8"))
    expanded = config.corpus.parent / "evaluation_medlineplus.json"
    if expanded.exists() and (config.corpus.parent / "medlineplus.json").exists():
        cases.extend(json.loads(expanded.read_text(encoding="utf-8")))
    semantic = not args.lexical and knowledge.info()["embedding_model"] == config.embed_model
    passed = 0
    results = []
    for case in cases:
        started = time.perf_counter()
        vector = (
            await model.embed(RETRIEVAL_INSTRUCTION + case["question"], keep_alive="5m")
            if semantic
            else None
        )
        matches = knowledge.search(case["question"], vector)
        found = (
            not matches
            if case.get("expect_empty")
            else case["expected_id"] in [article.id for article in matches]
            if "expected_id" in case
            else case["expected_url"] in [article.url for article in matches]
        )
        passed += int(found)
        results.append(
            {
                **case,
                "passed": found,
                "returned_ids": [article.id for article in matches],
                "returned_urls": [article.url for article in matches],
                "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
            }
        )
        print(f"{'PASS' if found else 'FAIL'} {case['question']}")
    positive = [case for case in results if not case.get("expect_empty")]
    negative = [case for case in results if case.get("expect_empty")]
    report = {
        "mode": "hybrid" if semantic else "lexical",
        "knowledge": knowledge.info(),
        "recall_at_3": {"passed": sum(case["passed"] for case in positive), "total": len(positive)},
        "negative_queries": {
            "passed": sum(case["passed"] for case in negative),
            "total": len(negative),
        },
        "clinical_validation": False,
        "cases": results,
    }
    print(f"Recall@3: {report['recall_at_3']}; negative queries: {report['negative_queries']}.")
    print("A small regression set: retrieval only, not answer quality or medical safety.")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    if passed != len(cases):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
