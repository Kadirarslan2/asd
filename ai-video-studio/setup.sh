#!/usr/bin/env bash
# macOS / Linux kurulumu
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -e ".[llm,dev]"
[ -f .env ] || cp .env.example .env
studio doctor
