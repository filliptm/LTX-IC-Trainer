"""Process management API router.

Exposes the ``ProcessManager`` to the webui over three surfaces:

1. **HTTP** for start / stop / status / logs / command preview (classic REST)
2. **SSE** at ``/sse/processes`` for legacy polling-style status + log diffs
3. **WebSocket** at ``/ws/processes/{type}/logs`` for live log streaming
   (used by the Train tab's terminal; every stdout line arrives within
   milliseconds instead of the ~1.5s HTTP polling cadence)

The pause / resume endpoints sit on top of the existing ``--save_state`` +
``--resume`` / ``--autoresume`` machinery in the training scripts:

- **pause** = graceful stop. The training script writes out its final
  checkpoint via ``--save_state_on_train_end`` (which the command builder
  always forces on for webui-launched training). The router then scans
  ``training.output_dir`` for the most recent state directory and stashes
  it on the ``ProcessManager`` so the Resume button knows where to point.
- **resume** = rebuild the same command, prepend ``--resume <saved_dir>``,
  and relaunch.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from sse_starlette.sse import EventSourceResponse

from ltx_ic_lora_trainer.webui.command_builder import (
    build_cache_dino_cmd,
    build_cache_latents_cmd,
    build_cache_text_cmd,
    build_inference_cmd,
    build_slider_training_cmd,
    build_training_cmd,
)
from ltx_ic_lora_trainer.webui.process_manager import ProcessManager

router = APIRouter(tags=["processes"])

_MEDIA_EXTS = frozenset({
    ".mp4", ".webm", ".avi", ".mkv", ".mov",
    ".png", ".jpg", ".jpeg", ".webp", ".bmp",
    ".wav", ".flac", ".mp3", ".ogg", ".m4a",
})

VALID_TYPES = (
    "cache_latents",
    "cache_text",
    "cache_dino",
    "training",
    "inference",
    "slider_training",
    "merge_lora",
)


def _get_pm(request: Request) -> ProcessManager:
    return request.app.state.process_manager


def _get_config(request: Request):
    config = request.app.state.project_config
    if config is None:
        raise HTTPException(status_code=400, detail="No project loaded")
    return config


def _validate_type(proc_type: str):
    if proc_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type: {proc_type}. Must be one of {VALID_TYPES}")


def _build_cmd(proc_type: str, config) -> list[str]:
    """Build command list for a given process type."""
    if proc_type == "cache_latents":
        return build_cache_latents_cmd(config)
    elif proc_type == "cache_text":
        return build_cache_text_cmd(config)
    elif proc_type == "cache_dino":
        return build_cache_dino_cmd(config)
    elif proc_type == "training":
        return build_training_cmd(config)
    elif proc_type == "inference":
        return build_inference_cmd(config)
    elif proc_type == "slider_training":
        return build_slider_training_cmd(config)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown type: {proc_type}")


def _find_latest_state_dir(output_dir: str) -> Optional[str]:
    """Locate the most recent saved training state directory under output_dir.

    The training script writes state to subdirectories whose names contain
    ``state`` (e.g. ``ltx2_lora-state``, ``ltx2_lora-step000100-state``, or
    a datetime-suffixed variant). Returns the one with the highest mtime,
    or ``None`` if nothing matches.
    """
    if not output_dir or not os.path.isdir(output_dir):
        return None
    candidates: list[tuple[float, str]] = []
    try:
        for name in os.listdir(output_dir):
            if "state" not in name.lower():
                continue
            full = os.path.join(output_dir, name)
            if not os.path.isdir(full):
                continue
            try:
                mtime = os.path.getmtime(full)
            except OSError:
                continue
            candidates.append((mtime, full))
    except OSError:
        return None
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


@router.post("/api/processes/{proc_type}/start")
async def start_process(proc_type: str, request: Request):
    _validate_type(proc_type)
    pm = _get_pm(request)
    config = _get_config(request)

    try:
        cmd = _build_cmd(proc_type, config)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build command: {e}")

    try:
        pm.start(proc_type, cmd, cwd=config.project_dir or None)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {"ok": True, "state": pm.get_status(proc_type)["state"]}


@router.post("/api/processes/{proc_type}/stop")
async def stop_process(proc_type: str, request: Request):
    _validate_type(proc_type)
    pm = _get_pm(request)
    pm.stop(proc_type)
    return {"ok": True}


@router.post("/api/processes/{proc_type}/pause")
async def pause_process(proc_type: str, request: Request):
    """Graceful stop that also stashes the resume state directory.

    The training script is expected to write its final checkpoint via
    ``--save_state_on_train_end`` (always forced on by the command builder
    for webui-launched training). After the process exits, the router
    scans the project's ``training.output_dir`` for the most recent state
    directory and records it on the ProcessManager so the Resume endpoint
    can find it.
    """
    _validate_type(proc_type)
    pm = _get_pm(request)
    config = _get_config(request)

    # Graceful stop first. The process reader thread will flip state from
    # STOPPING → FINISHED after the subprocess drains.
    pm.stop(proc_type)

    # Wait briefly for the state directory to land on disk. The training
    # script's save_state_on_train_end runs inside the accelerator's
    # teardown, which usually completes within a couple of seconds after
    # terminate() is called. We poll for up to ~30 seconds.
    out_dir = getattr(config.training, "output_dir", "") or ""
    latest: Optional[str] = None
    for _ in range(60):
        await asyncio.sleep(0.5)
        status = pm.get_status(proc_type)
        latest = _find_latest_state_dir(out_dir)
        # Exit as soon as the process is no longer running AND we have a
        # state dir (or we've given up waiting for one).
        if status["state"] != "running":
            if latest is not None or _ > 20:
                break

    if latest is not None:
        pm.set_resume_state_dir(proc_type, latest)

    return {"ok": True, "resume_state_dir": latest}


@router.post("/api/processes/{proc_type}/resume")
async def resume_process(proc_type: str, request: Request):
    """Relaunch a process with ``--resume <saved_state_dir>`` appended.

    Requires a prior ``pause`` call to have stashed the resume state dir.
    Falls back to scanning ``output_dir`` if nothing is stashed but the
    project still has state directories on disk.
    """
    _validate_type(proc_type)
    pm = _get_pm(request)
    config = _get_config(request)

    resume_dir = pm.get_resume_state_dir(proc_type)
    if resume_dir is None:
        # Fallback: scan the training output dir directly.
        out_dir = getattr(config.training, "output_dir", "") or ""
        resume_dir = _find_latest_state_dir(out_dir)

    if resume_dir is None or not os.path.isdir(resume_dir):
        raise HTTPException(
            status_code=400,
            detail="No saved training state found to resume from. Start a fresh run instead.",
        )

    try:
        cmd = _build_cmd(proc_type, config)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build command: {e}")

    # Inject --resume before launching. Guard against double-resume if the
    # project config already had a --resume path.
    if "--resume" not in cmd:
        cmd += ["--resume", resume_dir]

    try:
        pm.start(proc_type, cmd, cwd=config.project_dir or None)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {"ok": True, "state": pm.get_status(proc_type)["state"], "resumed_from": resume_dir}


@router.get("/api/processes/{proc_type}/status")
async def get_process_status(proc_type: str, request: Request):
    _validate_type(proc_type)
    pm = _get_pm(request)
    status = pm.get_status(proc_type)
    status["resume_state_dir"] = pm.get_resume_state_dir(proc_type)
    return status


@router.get("/api/processes/{proc_type}/logs")
async def get_process_logs(
    proc_type: str,
    request: Request,
    last_n: Optional[int] = Query(None, description="Return last N lines"),
):
    _validate_type(proc_type)
    pm = _get_pm(request)
    return {"lines": pm.get_logs(proc_type, last_n=last_n)}


@router.get("/api/processes/{proc_type}/command-preview")
async def get_command_preview(proc_type: str, request: Request):
    """Return the CLI command that would be run for the given process type."""
    _validate_type(proc_type)
    config = _get_config(request)

    try:
        cmd = _build_cmd(proc_type, config)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build command: {e}")

    return {"command": " ".join(cmd)}


@router.get("/api/processes/status")
async def get_all_process_statuses(request: Request):
    pm = _get_pm(request)
    return pm.get_all_statuses()


@router.get("/sse/processes")
async def sse_process_stream(request: Request):
    """SSE stream that emits process status changes and new log lines.

    Legacy endpoint still used by the Project / Dataset pages for the small
    inline process cards. The Train tab uses the faster WebSocket path.
    """
    pm = _get_pm(request)

    async def event_generator():
        last_statuses: dict = {}
        last_log_counts = {t: 0 for t in VALID_TYPES}

        while True:
            await asyncio.sleep(1)

            # Check for status changes
            current = pm.get_all_statuses()
            if current != last_statuses:
                last_statuses = current
                yield {"event": "status", "data": json.dumps(current)}

            # Check for new log lines
            for proc_type in VALID_TYPES:
                logs = pm.get_logs(proc_type)
                count = len(logs)
                if count > last_log_counts[proc_type]:
                    new_lines = logs[last_log_counts[proc_type]:]
                    last_log_counts[proc_type] = count
                    yield {
                        "event": "logs",
                        "data": json.dumps({
                            "type": proc_type,
                            "lines": new_lines,
                        }),
                    }

    return EventSourceResponse(event_generator())


@router.websocket("/ws/processes/{proc_type}/logs")
async def ws_process_logs(websocket: WebSocket, proc_type: str):
    """WebSocket endpoint that streams every new stdout line in real time.

    Protocol:
    - On accept, the server dumps the entire current log buffer as a JSON
      message ``{"type": "history", "lines": [...]}`` so late joiners see
      historical output.
    - After that, each new stdout line arrives as
      ``{"type": "line", "line": "..."}``.
    - The server never reads inbound messages. Clients should not send
      anything; close to disconnect.
    """
    if proc_type not in VALID_TYPES:
        await websocket.close(code=1008, reason=f"Invalid proc_type: {proc_type}")
        return

    pm: ProcessManager = websocket.app.state.process_manager
    await websocket.accept()

    # Send history first so the terminal isn't blank until the next line arrives.
    history = pm.get_logs(proc_type)
    try:
        await websocket.send_text(json.dumps({"type": "history", "lines": history}))
    except Exception:
        return

    # Set up a cross-thread queue: the ProcessManager's log thread pushes
    # lines via sync callback; this coroutine drains the queue and sends
    # them over the WebSocket.
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str] = asyncio.Queue()

    def _on_line(line: str) -> None:
        # Called from the log-reader thread. Hand the line to the event
        # loop without blocking the log thread.
        try:
            loop.call_soon_threadsafe(queue.put_nowait, line)
        except RuntimeError:
            # Loop has been shut down; drop the line.
            pass

    pm.subscribe_logs(proc_type, _on_line)

    try:
        while True:
            line = await queue.get()
            await websocket.send_text(json.dumps({"type": "line", "line": line}))
    except WebSocketDisconnect:
        pass
    except Exception:
        # Unknown failure — break out and let the finally clean up.
        pass
    finally:
        pm.unsubscribe_logs(proc_type, _on_line)
        try:
            await websocket.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------


@router.post("/api/processes/pipeline/start")
async def start_pipeline(request: Request):
    """Start a cache-then-train pipeline.

    Checks which cache steps are needed (text encoder, latents), skips
    completed ones, then runs training. All steps execute sequentially.
    """
    pm = _get_pm(request)
    config = _get_config(request)

    # Determine which cache steps are needed.
    needs_text = False
    needs_latent = False
    for ds in config.dataset.datasets:
        if not ds.directory:
            continue
        total = sum(
            1 for f in os.listdir(ds.directory)
            if os.path.isfile(os.path.join(ds.directory, f))
            and os.path.splitext(f)[1].lower() in _MEDIA_EXTS
        ) if os.path.isdir(ds.directory) else 0

        text_cached = 0
        latent_cached = 0
        if ds.cache_directory and os.path.isdir(ds.cache_directory):
            for name in os.listdir(ds.cache_directory):
                if name.endswith("_ltx2_te.safetensors"):
                    text_cached += 1
                elif "_ltx2" in name and name.endswith(".safetensors"):
                    latent_cached += 1

        if total > 0 and text_cached < total:
            needs_text = True
        if total > 0 and latent_cached < total:
            needs_latent = True

    steps: list[tuple[str, list[str]]] = []
    if needs_text:
        steps.append(("cache_text", build_cache_text_cmd(config)))
    if needs_latent:
        steps.append(("cache_latents", build_cache_latents_cmd(config)))
    steps.append(("training", build_training_cmd(config)))

    cwd = config.project_dir or None
    pm.start_pipeline(steps, cwd=cwd)

    return {
        "ok": True,
        "steps": [s[0] for s in steps],
        "skipped_text_cache": not needs_text,
        "skipped_latent_cache": not needs_latent,
    }


@router.post("/api/processes/pipeline/cancel")
async def cancel_pipeline(request: Request):
    pm = _get_pm(request)
    pm.cancel_pipeline()
    return {"ok": True}


@router.get("/api/processes/pipeline/status")
async def pipeline_status(request: Request):
    pm = _get_pm(request)
    return pm.get_pipeline_status()
