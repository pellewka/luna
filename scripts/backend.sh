#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_dir="$project_dir/backend"
environment_dir="$project_dir/.venv"

if [[ ! -x "$environment_dir/bin/python" ]]; then
  environment_dir="$backend_dir/.venv"
fi

if [[ ! -x "$environment_dir/bin/python" ]]; then
  python3 -m venv "$environment_dir"
fi

python_bin="$environment_dir/bin/python"
"$python_bin" -c 'import sys; assert sys.version_info >= (3, 11), "Нужен Python 3.11 или новее"'
"$python_bin" -m pip install --disable-pip-version-check -r "$backend_dir/requirements.txt"
cd "$backend_dir"

case "${1:-serve}" in
  serve)
    exec "$python_bin" -m uvicorn app.main:app --host "${LUNA_HOST:-127.0.0.1}" --port "${LUNA_PORT:-8001}" --no-access-log
    ;;
  index)
    shift
    "$python_bin" -m scripts.build_index --semantic "$@"
    exec "$python_bin" -m scripts.evaluate
    ;;
  update)
    shift
    exec "$python_bin" -m scripts.import_medlineplus "$@"
    ;;
  evaluate)
    shift
    exec "$python_bin" -m scripts.evaluate "$@"
    ;;
  training-data)
    shift
    exec "$python_bin" -m training.prepare "$@"
    ;;
  *)
    echo 'Используйте npm run backend, npm run rag:update, npm run rag:index или npm run rag:check.' >&2
    exit 1
    ;;
esac
