#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8000}"
exec .venv/bin/python main.py
