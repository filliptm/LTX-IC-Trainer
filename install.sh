#!/usr/bin/env bash
# Install script for LTX-IC-Trainer (macOS / Linux).
#
# Usage:
#   ./install.sh                      # cu128 + webui (default)
#   CUDA_EXTRA=cu124 ./install.sh     # pin a different CUDA wheel index
#   SKIP_FRONTEND=1   ./install.sh    # skip the pnpm install/build step
#
# Set CUDA_EXTRA to one of: cu124, cu128, cu130.

set -euo pipefail

CUDA_EXTRA="${CUDA_EXTRA:-cu128}"
SKIP_FRONTEND="${SKIP_FRONTEND:-0}"

case "$CUDA_EXTRA" in
    cu124|cu128|cu130) ;;
    *)
        echo "error: CUDA_EXTRA must be one of cu124, cu128, cu130 (got: $CUDA_EXTRA)" >&2
        exit 1
        ;;
esac

cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
    echo "error: 'uv' is not installed. Install it from https://github.com/astral-sh/uv and re-run." >&2
    exit 1
fi

echo "==> Installing Python deps with uv (--extra $CUDA_EXTRA --extra webui)"
# Unset VIRTUAL_ENV so uv targets the project's .venv instead of warning about
# a stale ambient env var (common when launching from a shell that already
# activated some other Python environment).
env -u VIRTUAL_ENV uv sync --extra "$CUDA_EXTRA" --extra webui

if [ "$SKIP_FRONTEND" = "1" ]; then
    echo "==> SKIP_FRONTEND=1, skipping frontend build"
    echo "Done."
    exit 0
fi

if ! command -v node >/dev/null 2>&1; then
    echo "error: 'node' is not installed (need Node 20+ for the webui frontend)." >&2
    echo "       Install Node, then re-run, or set SKIP_FRONTEND=1 to skip." >&2
    exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
    echo "error: 'corepack' is not available. It ships with Node 16.10+; please update Node." >&2
    exit 1
fi

echo "==> Building webui frontend"
# Use `corepack pnpm` directly: avoids `corepack enable` which writes shims into
# the global Node install dir and fails on Windows without admin. The pnpm
# version is pinned via the "packageManager" field in frontend/package.json.
pushd src/ltx_ic_lora_trainer/webui/frontend >/dev/null
corepack pnpm install
corepack pnpm build
popd >/dev/null

echo
echo "Done. Launch the webui with: ./run.sh"
