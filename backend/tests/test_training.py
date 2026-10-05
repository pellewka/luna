import asyncio
import json
import sys
from dataclasses import replace
from threading import Event
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.mlx_model import TrainedModel
from app.model import ModelUnavailable
from app.schemas import Usage
from training.artifacts import MODEL_ID, base_fingerprint, file_hash, validate_adapter, write_json
from training.dataset import read_dataset, tokenize_examples
from training.evaluate import check_reply, passes_comparison
from training.prepare import prepare


def test_prepared_data_is_reproducible_and_sources_are_separate(tmp_path):
    first = prepare(tmp_path / "first")
    second = prepare(tmp_path / "second")
    assert first == second
    manifest, splits = read_dataset(tmp_path / "first")
    assert manifest["patient_records_used"] is False
    assert len(splits["train"]) > 100
    source_sets = [{row["source_url"] for row in rows} for rows in splits.values()]
    assert not source_sets[0] & source_sets[1]
    assert not source_sets[0] & source_sets[2]
    assert not source_sets[1] & source_sets[2]
    for rows in splits.values():
        for row in rows:
            assert row["origin"] in {"public_reference", "synthetic_context"}
            assert check_reply(row["messages"][-1]["content"], row)["accepted"]


def test_modified_dataset_is_rejected(tmp_path):
    prepare(tmp_path)
    with (tmp_path / "test.jsonl").open("a") as target:
        target.write("{}\n")
    with pytest.raises(ValueError, match="изменён"):
        read_dataset(tmp_path)


def test_cross_source_contamination_is_rejected(tmp_path):
    manifest = prepare(tmp_path)
    training = json.loads((tmp_path / "train.jsonl").read_text().splitlines()[0])
    lines = (tmp_path / "test.jsonl").read_text().splitlines()
    row = json.loads(lines[0])
    row["source_url"] = training["source_url"]
    lines[0] = json.dumps(row, ensure_ascii=False)
    (tmp_path / "test.jsonl").write_text("\n".join(lines) + "\n")
    manifest["files"]["test"] = file_hash(tmp_path / "test.jsonl")
    write_json(tmp_path / "manifest.json", manifest)
    with pytest.raises(ValueError, match="источник"):
        read_dataset(tmp_path)


def test_targets_are_never_silently_truncated():
    class Tokenizer:
        def apply_chat_template(self, messages, **options):
            assert options["enable_thinking"] is False
            if options["add_generation_prompt"]:
                return [1, 2]
            return [1, 2, *([3] * int(messages[-1]["content"]))]

    rows = [
        {
            "id": name,
            "messages": [{"role": "user", "content": "q"}, {"role": "assistant", "content": size}],
        }
        for name, size in (("short", "3"), ("long", "20"))
    ]
    tokens, report = tokenize_examples(rows, Tokenizer(), 10)
    assert tokens == [([1, 2, 3, 3, 3], 2)]
    assert report["excluded_too_long"] == ["long"]


@pytest.fixture
def adapter_files(tmp_path):
    base = tmp_path / "base"
    base.mkdir()
    for name in ("model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json"):
        (base / name).write_text("test fixture, not a model")
    adapter = tmp_path / "adapter"
    adapter.mkdir()
    (adapter / "adapters.safetensors").write_text("updated test fixture")
    write_json(adapter / "adapter_config.json", {"num_layers": 4})
    report = {
        "status": "completed",
        "model_id": MODEL_ID,
        "optimizer_updates": 2,
        "base_sha256": base_fingerprint(base),
        "adapter_sha256": file_hash(adapter / "adapters.safetensors"),
        "initial_adapter_sha256": "initial",
        "max_weight_change": 0.0001,
        "adapter_config_sha256": file_hash(adapter / "adapter_config.json"),
        "dataset_files": {"test": "test-hash"},
    }
    write_json(adapter / "training_report.json", report)
    write_json(
        adapter / "evaluation.json",
        {
            "status": "passed",
            "adapter_sha256": report["adapter_sha256"],
            "base_sha256": report["base_sha256"],
            "test_sha256": "test-hash",
        },
    )
    return base, adapter, report


def test_adapter_integrity_covers_base_and_trained_weights(adapter_files):
    base, adapter, report = adapter_files
    assert validate_adapter(base, adapter, check_base=True, require_evaluation=True) == report
    (base / "tokenizer_config.json").write_text("different chat template")
    with pytest.raises(ValueError, match="Базовая модель"):
        validate_adapter(base, adapter, check_base=True)
    (adapter / "adapters.safetensors").write_text("different weights")
    with pytest.raises(ValueError, match="весов изменился"):
        validate_adapter(base, adapter)


@pytest.mark.parametrize("change", [0, -1, float("nan")])
def test_unchanged_or_invalid_weights_cannot_be_loaded(adapter_files, change):
    base, adapter, report = adapter_files
    report["max_weight_change"] = change
    write_json(adapter / "training_report.json", report)
    with pytest.raises(ValueError, match="изменение"):
        validate_adapter(base, adapter)


def test_interrupted_training_and_stale_evaluation_cannot_be_loaded(adapter_files):
    base, adapter, report = adapter_files
    write_json(adapter / "evaluation.json", {"status": "passed", "adapter_sha256": "old"})
    with pytest.raises(ValueError, match="проверку"):
        validate_adapter(base, adapter, require_evaluation=True)
    report["status"] = "interrupted"
    write_json(adapter / "training_report.json", report)
    with pytest.raises(ValueError, match="не завершено"):
        validate_adapter(base, adapter)


def test_english_success_cannot_hide_russian_regression():
    english = [{"language": "en", "checks": {"accepted": True}}] * 16
    russian = [{"language": "ru", "checks": {"accepted": True}}] * 2
    baseline = {"responses": english + russian}
    candidate = {"responses": english + [{"language": "ru", "checks": {"accepted": False}}] * 2}
    assert not passes_comparison(baseline, candidate)
    assert passes_comparison(baseline, baseline)


def test_missing_trained_weights_do_not_fall_back_to_ollama(settings, monkeypatch):
    monkeypatch.setattr("app.mlx_model.platform.system", lambda: "Darwin")
    monkeypatch.setattr("app.mlx_model.platform.machine", lambda: "arm64")
    config = replace(
        settings,
        model_backend="mlx",
        generation_enabled=True,
        adapter_path=settings.database.parent / "missing",
    )
    with TestClient(create_app(config)) as client:
        health = client.get("/health").json()
        assert health["model"]["state"] == "missing"
        response = client.post("/v1/chat", json={"message": "Что такое ПМС?"}).json()
        assert response["mode"] == "reference"


def test_timeout_does_not_queue_another_model_run(settings, monkeypatch):
    started = Event()
    released = Event()
    model = TrainedModel(replace(settings, model_backend="mlx", model_timeout=0.1))

    def slow_generate(messages, stop):
        started.set()
        released.wait(2)
        assert stop.is_set()
        raise TimeoutError()

    monkeypatch.setattr(model, "generate_sync", slow_generate)

    async def scenario():
        with pytest.raises(TimeoutError):
            await model.generate([])
        assert started.is_set()
        with pytest.raises(ModelUnavailable, match="предыдущий"):
            await model.generate([])

    try:
        asyncio.run(scenario())
    finally:
        released.set()
        model.close()


def test_generation_loads_the_configured_adapter_once(settings, monkeypatch, tmp_path):
    calls = []
    loaded_model = SimpleNamespace(eval=lambda: None)
    tokenizer = object()

    def load(path, **options):
        calls.append((path, options))
        return loaded_model, tokenizer

    monkeypatch.setitem(sys.modules, "mlx_lm", SimpleNamespace(load=load))
    monkeypatch.setattr(TrainedModel, "validate", lambda self, **options: {})

    def generate(model, actual_tokenizer, messages, stop):
        assert model is loaded_model
        assert actual_tokenizer is tokenizer
        assert messages[-1]["content"] == "Вопрос с разрешённым контекстом"
        return json.dumps(
            {"answer": "Пояснение по переданным источникам.", "source_ids": ["pms"]},
            ensure_ascii=False,
        ), Usage(input_tokens=10, output_tokens=5)

    monkeypatch.setattr("app.mlx_model.generate_text", generate)
    config = replace(
        settings,
        model_backend="mlx",
        base_model_path=tmp_path / "base",
        adapter_path=tmp_path / "trained",
    )
    model = TrainedModel(config)

    async def scenario():
        for _ in range(2):
            answer, usage = await model.generate(
                [{"role": "user", "content": "Вопрос с разрешённым контекстом"}]
            )
            assert answer.source_ids == ["pms"]
            assert usage.output_tokens == 5

    try:
        asyncio.run(scenario())
    finally:
        model.close()
    assert calls == [
        (
            str(config.base_model_path),
            {"adapter_path": str(config.adapter_path), "trust_remote_code": False},
        )
    ]
