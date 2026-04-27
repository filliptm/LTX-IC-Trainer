"""Sample and checkpoint browsing endpoints."""

from __future__ import annotations

import os
import re
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse

from ltx_ic_lora_trainer.webui.project_schema import ProjectConfig

router = APIRouter(prefix="/api/samples", tags=["samples"])

_STEP_RE = re.compile(r"-step(\d+)\.safetensors$")


def _get_run_dir(request: Request) -> Optional[str]:
    config: ProjectConfig | None = request.app.state.project_config
    if config and config.training.output_dir:
        return config.training.output_dir
    return None


@router.get("/list")
async def list_samples(request: Request):
    """List all files under the current run's sample/ directory."""
    run_dir = _get_run_dir(request)
    if not run_dir:
        return {"samples": []}

    sample_dir = os.path.join(run_dir, "sample")
    if not os.path.isdir(sample_dir):
        return {"samples": []}

    entries: list[dict] = []
    for root, _, files in os.walk(sample_dir):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, sample_dir).replace("\\", "/")
            try:
                stat = os.stat(full)
            except OSError:
                continue
            entries.append(
                {
                    "path": rel,
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                }
            )
    entries.sort(key=lambda e: e["mtime"], reverse=True)
    return {"samples": entries}


@router.get("/checkpoints")
async def list_checkpoints(request: Request):
    """List all LoRA checkpoints in the training output directory."""
    run_dir = _get_run_dir(request)
    if not run_dir:
        return {"checkpoints": []}

    checkpoints: list[dict] = []
    try:
        entries = os.listdir(run_dir)
    except OSError:
        return {"checkpoints": []}

    for name in entries:
        # Match pattern: {name}-step{NNNNN}.safetensors (exclude .comfy variants)
        if name.endswith(".comfy.safetensors"):
            continue
        m = _STEP_RE.search(name)
        if not m:
            continue

        full = os.path.join(run_dir, name)
        step = int(m.group(1))
        try:
            stat = os.stat(full)
        except OSError:
            continue

        comfy_name = name.replace(".safetensors", ".comfy.safetensors")
        state_dir_name = name.replace(".safetensors", "-state")
        state_dir_path = os.path.join(run_dir, state_dir_name)

        checkpoints.append({
            "filename": name,
            "step": step,
            "size_bytes": stat.st_size,
            "mtime": stat.st_mtime,
            "has_comfy": os.path.isfile(os.path.join(run_dir, comfy_name)),
            "has_state": os.path.isdir(state_dir_path),
            "state_dir": state_dir_path if os.path.isdir(state_dir_path) else None,
        })

    checkpoints.sort(key=lambda c: c["step"])
    return {"checkpoints": checkpoints}


@router.get("/{file_path:path}")
async def get_sample(file_path: str, request: Request):
    run_dir = _get_run_dir(request)
    if not run_dir:
        return HTMLResponse("no training output configured", status_code=404)
    # Prevent path-traversal outside the sample directory
    sample_dir = os.path.realpath(os.path.join(run_dir, "sample"))
    full_path = os.path.realpath(os.path.join(sample_dir, file_path))
    if not full_path.startswith(sample_dir):
        return HTMLResponse("forbidden", status_code=403)
    if not os.path.exists(full_path):
        return HTMLResponse("not found", status_code=404)
    return FileResponse(full_path)
