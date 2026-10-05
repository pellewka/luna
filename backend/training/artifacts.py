import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "Qwen/Qwen3-8B"
BASE_PATH = ROOT / "models" / "qwen3-8b-4bit"
ADAPTER_PATH = ROOT / "models" / "luna-lora"
DATA_PATH = ROOT / "training" / "data"


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def base_fingerprint(path: Path) -> str:
    weights = sorted(path.glob("*.safetensors"))
    required = [path / "config.json", path / "tokenizer.json", path / "tokenizer_config.json"]
    if not weights or any(not item.is_file() for item in required):
        raise ValueError("Базовая модель неполная. Выполните npm run ai:prepare-model.")
    files = sorted([*weights, *required, *path.glob("*.jinja"), *path.glob("*.index.json")])
    digest = hashlib.sha256()
    for item in files:
        digest.update(item.name.encode())
        digest.update(file_hash(item).encode())
    return digest.hexdigest()


def validate_adapter(
    base_path: Path,
    adapter_path: Path,
    *,
    check_base: bool = False,
    require_evaluation: bool = False,
) -> dict:
    if not (base_path / "config.json").is_file() or not any(base_path.glob("*.safetensors")):
        raise ValueError("Базовые веса не найдены. Выполните npm run ai:prepare-model.")
    report = json.loads((adapter_path / "training_report.json").read_text(encoding="utf-8"))
    weights = adapter_path / "adapters.safetensors"
    if report.get("status") != "completed" or report.get("optimizer_updates", 0) < 1:
        raise ValueError("Обучение не завершено; новые веса пока не подключены.")
    if report.get("model_id") != MODEL_ID or not (adapter_path / "adapter_config.json").is_file():
        raise ValueError("Адаптер не соответствует выбранной базовой модели.")
    if file_hash(weights) != report.get("adapter_sha256"):
        raise ValueError("Файл весов изменился после обучения. Повторите оценку модели.")
    change = report.get("max_weight_change", 0)
    if not isinstance(change, (int, float)) or not math.isfinite(change) or change <= 0:
        raise ValueError("Не подтверждено численное изменение обучаемых весов.")
    if not report.get("initial_adapter_sha256") or report["initial_adapter_sha256"] == report.get(
        "adapter_sha256"
    ):
        raise ValueError("Обучение не изменило веса адаптера.")
    if file_hash(adapter_path / "adapter_config.json") != report.get("adapter_config_sha256"):
        raise ValueError("Настройки адаптера изменились после обучения.")
    if check_base and base_fingerprint(base_path) != report.get("base_sha256"):
        raise ValueError("Базовая модель отличается от использованной при обучении.")
    if require_evaluation:
        evaluation = json.loads((adapter_path / "evaluation.json").read_text(encoding="utf-8"))
        if (
            evaluation.get("status") != "passed"
            or evaluation.get("adapter_sha256") != report["adapter_sha256"]
            or evaluation.get("base_sha256") != report["base_sha256"]
            or evaluation.get("test_sha256") != report["dataset_files"]["test"]
        ):
            raise ValueError("Адаптер ещё не прошёл проверку. Выполните npm run ai:evaluate.")
    return report
