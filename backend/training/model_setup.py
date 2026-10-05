"""Download the official base weights once and convert them for local MLX use."""
import argparse
import importlib.metadata
import json
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

from .artifacts import BASE_PATH, MODEL_ID, base_fingerprint, write_json


def check_hardware(*, download: bool = False) -> dict:
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise ValueError("Этот запуск обучения рассчитан на Mac с Apple Silicon (M1 или новее).")
    memory = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True))
    free_disk = shutil.disk_usage(Path.cwd()).free
    if memory < 16 * 1024**3:
        raise ValueError(
            "Для этой конфигурации Qwen3-8B нужно не менее 16 ГБ памяти; предпочтительно 24 ГБ и больше."
        )
    if download and free_disk < 40 * 1024**3:
        raise ValueError("Освободите хотя бы 40 ГБ для исходных весов, кэша и 4-битной копии.")
    return {"memory_gib": round(memory / 1024**3), "free_disk_gib": round(free_disk / 1024**3)}


def prepare_model(destination: Path = BASE_PATH) -> dict:
    hardware = check_hardware()
    if destination.exists():
        manifest = json.loads((destination / "base_manifest.json").read_text(encoding="utf-8"))
        if manifest["model_id"] != MODEL_ID or manifest["sha256"] != base_fingerprint(destination):
            raise ValueError("Существующие веса не совпадают с описанием базовой модели.")
        return manifest

    from huggingface_hub import HfApi, snapshot_download
    from huggingface_hub.errors import LocalEntryNotFoundError
    from mlx_lm import convert
    from mlx_lm.utils import DEFAULT_ALLOW_PATTERNS

    # Resolve and record the upstream commit; never execute repository Python code.
    revision = HfApi().model_info(MODEL_ID).sha
    if not revision:
        raise ValueError("Не удалось определить версию исходных весов.")
    print("Проверяю исходные веса в кэше Hugging Face…", flush=True)
    try:
        source_path = snapshot_download(
            MODEL_ID,
            revision=revision,
            allow_patterns=DEFAULT_ALLOW_PATTERNS,
            local_files_only=True,
        )
    except LocalEntryNotFoundError:
        hardware = check_hardware(download=True)
        print("Скачиваю недостающие файлы модели…", flush=True)
        source_path = snapshot_download(
            MODEL_ID,
            revision=revision,
            allow_patterns=DEFAULT_ALLOW_PATTERNS,
            local_files_only=False,
        )
    if (
        shutil.disk_usage(destination.parent if destination.parent.exists() else Path.cwd()).free
        < 8 * 1024**3
    ):
        raise ValueError("Для сохранения 4-битной копии освободите хотя бы 8 ГБ на диске.")
    source_path = Path(source_path).resolve()
    if not source_path.is_dir():
        raise ValueError("Не найдена скачанная папка исходных весов.")
    print("Преобразую скачанную модель и сохраняю результат…", flush=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="luna-convert-", dir=destination.parent) as work:
        converted = Path(work) / "model"
        convert(
            str(source_path),
            mlx_path=str(converted),
            quantize=True,
            q_bits=4,
            q_group_size=64,
            trust_remote_code=False,
        )
        manifest = {
            "model_id": MODEL_ID,
            "revision": revision,
            "sha256": base_fingerprint(converted),
            "quantization": {"bits": 4, "group_size": 64, "mode": "affine"},
            "mlx_lm": importlib.metadata.version("mlx-lm"),
            "hardware": hardware,
            "source": f"https://huggingface.co/{MODEL_ID}/tree/{revision}",
        }
        write_json(converted / "base_manifest.json", manifest)
        converted.rename(destination)
    print(f"Базовая модель готова: {destination}\nСледующий шаг: npm run ai:train", flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Подготовить Qwen3-8B для дообучения")
    parser.add_argument("--check", action="store_true", help="Проверить Mac без скачивания весов")
    args = parser.parse_args()
    try:
        result = check_hardware(download=True) if args.check else prepare_model()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError) as failure:
        raise SystemExit(str(failure)) from None
