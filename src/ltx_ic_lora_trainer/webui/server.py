"""FastAPI app factory for the LTX-2 webui."""

from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import os
from pathlib import Path
from typing import Optional

# Windows registry often maps .js to text/plain — fix it
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse, HTMLResponse
from sse_starlette.sse import EventSourceResponse

from ltx_ic_lora_trainer.webui.process_manager import ProcessManager
from ltx_ic_lora_trainer.webui.project_schema import ProjectConfig
from ltx_ic_lora_trainer.webui.ws_hub import HubManager
from ltx_ic_lora_trainer.webui.routers import (
    captions,
    datasets,
    filesystem,
    metrics,
    processes,
    projects,
    samples,
    stats,
    system,
)

logger = logging.getLogger(__name__)

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")


def create_app(project_path: Optional[str] = None) -> FastAPI:
    """Create the LTX-2 webui FastAPI application."""
    app = FastAPI(title="LTX-2 Training Manager")

    app.state.process_manager = ProcessManager()
    app.state.project_config = None
    app.state.project_path = None
    app.state.hub_manager = HubManager(app)

    # Load project: explicit path first, then auto-discover.
    if project_path:
        p = Path(project_path)
        if p.is_dir():
            p = p / "project.json"
        if p.exists():
            try:
                app.state.project_config = ProjectConfig.load(p)
                app.state.project_path = p
                logger.info(f"Loaded project: {p}")
            except Exception as e:
                logger.warning(f"Failed to load project {p}: {e}")

    # Auto-discover: if no project was loaded yet, scan CWD for project.json
    # files and auto-load if exactly one is found.
    if app.state.project_config is None:
        _auto_discover_project(app)

    # API routers
    app.include_router(projects.router)
    app.include_router(datasets.router)
    app.include_router(processes.router)
    app.include_router(filesystem.router)
    app.include_router(system.router)
    app.include_router(stats.router)
    app.include_router(metrics.router)
    app.include_router(samples.router)
    app.include_router(captions.router)

    # Multiplexed WebSocket hub
    @app.websocket("/ws/hub")
    async def ws_hub(websocket: WebSocket):
        await app.state.hub_manager.connect(websocket)

    # SSE heartbeat for file-change notifications
    @app.get("/sse")
    async def sse_stream():
        async def event_generator():
            last_mtime = 0.0
            while True:
                await asyncio.sleep(2)
                run_dir = _get_run_dir(app)
                if not run_dir:
                    continue
                metrics_path = os.path.join(run_dir, "dashboard", "metrics.jsonl")
                try:
                    mtime = os.path.getmtime(metrics_path) if os.path.exists(metrics_path) else 0.0
                except OSError:
                    mtime = 0.0
                if mtime > last_mtime:
                    last_mtime = mtime
                    yield {"event": "update", "data": json.dumps({"mtime": mtime})}

        return EventSourceResponse(event_generator())

    # Frontend (must be last — catches all routes that aren't API/WS/SSE)
    if os.path.isdir(FRONTEND_DIST):
        from starlette.staticfiles import StaticFiles

        # Mount static assets first so hashed JS/CSS files resolve directly.
        app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="static-assets")

        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str):
            # Never intercept API, WebSocket, or SSE routes — those are
            # handled by the routers above. If we got here for an /api/ path,
            # it means the route genuinely doesn't exist.
            if full_path.startswith(("api/", "ws/", "sse/")):
                return HTMLResponse("not found", status_code=404)
            file_path = os.path.join(FRONTEND_DIST, full_path)
            if full_path and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

    else:

        @app.get("/")
        async def no_frontend():
            return HTMLResponse(
                "<h2>LTX-2 webui</h2>"
                "<p>Frontend not built. Run <code>pnpm install &amp;&amp; pnpm build</code> in "
                "<code>src/ltx_ic_lora_trainer/webui/frontend/</code>.</p>"
            )

    return app


def _get_run_dir(app: FastAPI) -> Optional[str]:
    """Get the current training output directory from project config."""
    config: ProjectConfig | None = app.state.project_config
    if config and config.training.output_dir:
        return config.training.output_dir
    return None


def _auto_discover_project(app: FastAPI) -> None:
    """Scan CWD (max depth 3) for project.json files. If exactly one is
    found, auto-load it so the UI starts with a project ready to go."""
    found: list[Path] = []
    cwd = Path.cwd()

    def _scan(directory: Path, depth: int) -> None:
        if depth > 3:
            return
        try:
            entries = directory.iterdir()
        except (OSError, PermissionError):
            return
        for entry in entries:
            name = entry.name
            if name.startswith(".") or name in ("node_modules", "__pycache__", "dist"):
                continue
            if entry.is_file() and name == "project.json":
                found.append(entry)
            elif entry.is_dir():
                _scan(entry, depth + 1)

    _scan(cwd, 0)

    if len(found) == 1:
        p = found[0]
        try:
            app.state.project_config = ProjectConfig.load(p)
            app.state.project_path = p
            logger.info(f"Auto-discovered and loaded project: {p}")
        except Exception as e:
            logger.warning(f"Auto-discovered project {p} but failed to load: {e}")
    elif found:
        names = [str(f.relative_to(cwd)) for f in found]
        logger.info(f"Auto-discover found {len(found)} projects: {names} — not auto-loading (ambiguous)")
