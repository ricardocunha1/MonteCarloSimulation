#!/usr/bin/env bash
# Runs once after the dev container is created.
set -euo pipefail

cd "$(dirname "$0")/.."

# Python virtualenv with project dependencies
if [ ! -d .venv ]; then
    python -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# GitVersion (.NET global tool)
bash .devcontainer/install-gitversion.sh

# Avoid "dubious ownership" errors that break GitVersion on bind-mounted repos
git config --global --add safe.directory "$(pwd)"
