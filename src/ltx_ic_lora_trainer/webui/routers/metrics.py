"""JSONL-based metrics endpoints for the LTX-2 webui."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Optional

from fastapi import APIRouter, Request, Response
from sse_starlette.sse import EventSourceResponse

from ltx_ic_lora_trainer.webui.project_schema import ProjectConfig

router = APIRouter(prefix="/api/runs", tags=["metrics"])


def _get_run_dir(request: Request) -> Optional[str]:
    config: ProjectConfig | None = request.app.state.project_config
    if config and config.training.output_dir:
        return config.training.output_dir
    return None


@router.get("/current/metrics")
async def get_metrics(request: Request, since_step: int = 0):
    """Return metrics rows with step > since_step."""
    run_dir = _get_run_dir(request)
    if not run_dir:
        return {"rows": []}

    path = os.path.join(run_dir, "dashboard", "metrics.jsonl")
    if not os.path.exists(path):
        return {"rows": []}

    rows: list[dict] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if int(row.get("step", 0)) > since_step:
                    rows.append(row)
    except OSError:
        pass
    return {"rows": rows}


@router.get("/current/status")
async def get_status(request: Request):
    run_dir = _get_run_dir(request)
    if not run_dir:
        return Response(status_code=204)
    path = os.path.join(run_dir, "dashboard", "status.json")
    if not os.path.exists(path):
        return Response(status_code=204)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return Response(status_code=204)


@router.get("/current/events")
async def get_events(request: Request):
    run_dir = _get_run_dir(request)
    if not run_dir:
        return {"events": []}
    path = os.path.join(run_dir, "dashboard", "events.jsonl")
    if not os.path.exists(path):
        return {"events": []}

    events: list[dict] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return {"events": events}


@router.get("/current/sse")
async def stream_metrics(request: Request):
    """Tail metrics.jsonl and emit a `metric` event for each new row."""

    async def event_generator():
        run_dir = _get_run_dir(request)
        if not run_dir:
            return
        path = os.path.join(run_dir, "dashboard", "metrics.jsonl")
        last_size = 0
        while True:
            if await request.is_disconnected():
                break
            await asyncio.sleep(1.0)
            if not os.path.exists(path):
                continue
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            if size <= last_size:
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    f.seek(last_size)
                    new = f.read(size - last_size)
                last_size = size
            except OSError:
                continue
            for line in new.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                yield {"event": "metric", "data": json.dumps(row)}

    return EventSourceResponse(event_generator())
