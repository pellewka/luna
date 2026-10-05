#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_dir="$project_dir/backend"
environment_dir="$project_dir/.venv-training"
action="${1:-doctor}"
if [[ $# -gt 0 ]]; then shift; fi

cd "$backend_dir"
python3 -c 'import platform, sys; sys.exit(0 if sys.version_info >= (3, 11) and platform.system() == "Darwin" and platform.machine() == "arm64" else "Нужны Mac с Apple Silicon и Python 3.11 или новее.")'

if [[ "$action" == "doctor" ]]; then
  exec python3 -m training.model_setup --check
fi

if [[ ! -x "$environment_dir/bin/python" ]]; then
  python3 -m venv "$environment_dir"
fi
python_bin="$environment_dir/bin/python"
"$python_bin" -m pip install --disable-pip-version-check -r "$backend_dir/requirements-training.txt"

case "$action" in
  prepare-model)
    exec "$python_bin" -m training.model_setup "$@"
    ;;
  train)
    exec "$python_bin" -m training.train "$@"
    ;;
  evaluate)
    exec "$python_bin" -m training.evaluate "$@"
    ;;
  serve)
    export LUNA_MODEL_BACKEND=mlx
    "$python_bin" -c 'from app.config import Settings; from training.artifacts import validate_adapter; s = Settings(); validate_adapter(s.base_model_path, s.adapter_path, check_base=True, require_evaluation=True); print("Обученные веса проверены. Запускаю сервер…")'
    exec "$python_bin" -m uvicorn app.main:app --host "${LUNA_HOST:-127.0.0.1}" --port "${LUNA_PORT:-8001}" --no-access-log
    ;;
  *)
    echo 'Используйте npm run ai:doctor, ai:prepare-model, ai:train, ai:evaluate или ai:serve.' >&2
    exit 1
    ;;
esac
