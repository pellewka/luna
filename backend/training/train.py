"""Train LoRA parameters on a frozen, quantized Qwen3-8B base."""

import argparse
import importlib.metadata
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from .artifacts import (
    ADAPTER_PATH,
    BASE_PATH,
    DATA_PATH,
    MODEL_ID,
    base_fingerprint,
    file_hash,
    write_json,
)
from .dataset import read_dataset, tokenize_examples
from .model_setup import check_hardware


class TrainingProgress:
    def __init__(self, output: Path):
        self.output = output
        self.last_iteration = 0
        self.losses = []

    def record(self, kind: str, values: dict) -> None:
        if any(isinstance(value, float) and not math.isfinite(value) for value in values.values()):
            raise ValueError("Обучение дало нечисловую ошибку; этот адаптер не будет подключён.")
        self.losses.append({"kind": kind, **values})
        write_json(self.output / "losses.json", self.losses)

    def on_train_loss_report(self, values: dict) -> None:
        self.record("train", values)
        self.last_iteration = values["iteration"]

    def on_val_loss_report(self, values: dict) -> None:
        self.record("valid", values)


def train_adapter(args) -> dict:
    hardware = check_hardware()
    if args.iters < 4 or args.iters % 4:
        raise ValueError(
            "Число итераций должно быть положительным и кратным 4 (накопление градиентов)."
        )
    if not 1 <= args.layers <= 36 or not 1024 <= args.max_length <= 4096:
        raise ValueError("Допустимы 1–36 обучаемых слоёв и длина 1024–4096 токенов.")
    if args.output.exists():
        raise ValueError(
            "Папка адаптера уже существует. Укажите новую через --output, чтобы сохранить прежние веса."
        )
    manifest, splits = read_dataset(args.data)
    base = json.loads((args.base / "base_manifest.json").read_text(encoding="utf-8"))
    if base["model_id"] != MODEL_ID or base_fingerprint(args.base) != base["sha256"]:
        raise ValueError("Базовые веса изменились после подготовки.")

    import mlx.core as mx
    import mlx.optimizers as optimizers
    import numpy as np
    from mlx.utils import tree_flatten
    from mlx_lm import load
    from mlx_lm.tuner.trainer import TrainingArgs, train
    from mlx_lm.tuner.utils import linear_to_lora_layers

    mx.random.seed(args.seed)
    np.random.seed(args.seed)
    model, tokenizer = load(str(args.base), trust_remote_code=False)
    training, training_counts = tokenize_examples(splits["train"], tokenizer, args.max_length)
    validation, validation_counts = tokenize_examples(splits["valid"], tokenizer, args.max_length)
    print(f"Полных примеров: обучение {len(training)}, проверка {len(validation)}.", flush=True)
    model.freeze()
    adapter_config = {
        "model": str(args.base),
        "fine_tune_type": "lora",
        "num_layers": args.layers,
        "lora_parameters": {"rank": 8, "scale": 16.0, "dropout": 0.05},
    }
    linear_to_lora_layers(model, args.layers, adapter_config["lora_parameters"])
    args.output.mkdir(parents=True)
    write_json(args.output / "adapter_config.json", adapter_config)
    weights = dict(tree_flatten(model.trainable_parameters()))
    initial_path = args.output / "initial.safetensors"
    mx.save_safetensors(str(initial_path), weights)
    initial_hash = file_hash(initial_path)
    initial_path.unlink()
    report = {
        "status": "running",
        "model_id": MODEL_ID,
        "base_sha256": base["sha256"],
        "base_revision": base["revision"],
        "initial_adapter_sha256": initial_hash,
        "adapter_config_sha256": file_hash(args.output / "adapter_config.json"),
        "trainable_parameters": sum(value.size for value in weights.values()),
        "dataset_files": manifest["files"],
        "clinical_review": "pending",
        "patient_records_used": False,
        "hardware": hardware,
        "tokenization": {"train": training_counts, "valid": validation_counts},
        "seed": args.seed,
        "iterations": args.iters,
        "learning_rate": 1e-5,
        "gradient_accumulation": 4,
        "max_length": args.max_length,
        "optimizer_updates": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "versions": {
            name: importlib.metadata.version(name) for name in ("mlx", "mlx-lm", "transformers")
        },
    }
    report_path = args.output / "training_report.json"
    write_json(report_path, report)
    progress = TrainingProgress(args.output)
    try:
        train(
            model,
            optimizers.AdamW(learning_rate=1e-5),
            training,
            validation,
            args=TrainingArgs(
                batch_size=1,
                iters=args.iters,
                val_batches=-1,
                steps_per_report=4,
                steps_per_eval=40,
                steps_per_save=40,
                max_seq_length=args.max_length,
                adapter_file=str(args.output / "adapters.safetensors"),
                grad_checkpoint=True,
                grad_accumulation_steps=4,
            ),
            training_callback=progress,
        )
        result_hash = file_hash(args.output / "adapters.safetensors")
        final_weights = dict(tree_flatten(model.trainable_parameters()))
        changes = [
            float(mx.max(mx.abs(final_weights[name] - initial)).item())
            for name, initial in weights.items()
        ]
        max_change = max(changes)
        if (
            progress.last_iteration != args.iters
            or result_hash == initial_hash
            or not all(math.isfinite(change) for change in changes)
            or max_change <= 0
        ):
            raise ValueError("Обновление весов не подтверждено. Адаптер не подключён.")
        report.update(
            status="completed",
            adapter_sha256=result_hash,
            optimizer_updates=progress.last_iteration // 4,
            max_weight_change=max_change,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
    except BaseException:
        report.update(status="interrupted", optimizer_updates=progress.last_iteration // 4)
        raise
    finally:
        write_json(report_path, report)
    print("Веса адаптера обучены. Следующий шаг: npm run ai:evaluate", flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Настоящее LoRA-дообучение Qwen3-8B")
    parser.add_argument("--base", type=Path, default=BASE_PATH)
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--output", type=Path, default=ADAPTER_PATH)
    parser.add_argument("--iters", type=int, default=240)
    parser.add_argument("--layers", type=int, default=4)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--seed", type=int, default=42)
    try:
        train_adapter(parser.parse_args())
    except (ValueError, OSError, KeyError) as failure:
        raise SystemExit(str(failure)) from None
