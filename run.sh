#!/usr/bin/env bash
# Launch the LTX-IC-Trainer webui (macOS / Linux).
#
# Forwards any extra args to the webui module, e.g.:
#   ./run.sh                          # default: 127.0.0.1:7860
#   ./run.sh --port 8000
#   ./run.sh --host 0.0.0.0           # LAN access
#   ./run.sh --dev                    # Vite dev server + hot reload
#   ./run.sh --project path/to/project.json

set -euo pipefail

cd "$(dirname "$0")"

# Activate a local venv if one exists. Handle both POSIX (.venv/bin) and
# Windows-under-bash (.venv/Scripts) layouts so the same script works on
# Linux, macOS, and Git Bash / MSYS / Cygwin.
if [ -f ".venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    . .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    # shellcheck disable=SC1091
    . .venv/Scripts/activate
fi

# Pick the venv's Python if present; else fall back to whatever's on PATH.
if [ -x ".venv/bin/python" ]; then
    PY=".venv/bin/python"
elif [ -x ".venv/Scripts/python.exe" ]; then
    PY=".venv/Scripts/python.exe"
else
    PY="python"
fi

if [ "$#" -eq 0 ]; then
    set -- --host 127.0.0.1 --port 7860
fi

echo "Starting LTX-2 webui..."
exec "$PY" -m ltx_ic_lora_trainer.webui "$@"
