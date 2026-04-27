"""Multiplexed WebSocket hub for the LTX-2 webui.

Provides a single ``/ws/hub`` endpoint that clients can subscribe to
multiple channels on.  Replaces per-concern HTTP polling with server push.

Channels:
    system          — SystemInfo dict, pushed every ~5 s
    process_status  — all process statuses, pushed every ~2 s
    metrics         — new JSONL metric rows, tailed every ~1 s
    caption_saved   — on-demand push when a caption file is written

Protocol (JSON over WebSocket text frames):

    Client → server (once, after connect):
        {"subscribe": ["system", "process_status"]}

    Server → client (ongoing):
        {"channel": "system", "data": {...}}
        {"channel": "process_status", "data": {...}}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import TYPE_CHECKING

from fastapi import WebSocket, WebSocketDisconnect

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

VALID_CHANNELS = frozenset({"system", "process_status", "metrics", "caption_saved"})


class _Client:
    """One connected WebSocket + the channels it subscribes to."""

    __slots__ = ("ws", "channels", "queue")

    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self.channels: set[str] = set()
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=256)


class HubManager:
    """Owns the background producer tasks and the set of connected clients."""

    def __init__(self, app: FastAPI) -> None:
        self._app = app
        self._clients: set[_Client] = set()
        self._lock = asyncio.Lock()
        self._tasks: list[asyncio.Task] = []
        self._started = False
        # Metrics tailing state
        self._metrics_last_size = 0

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    async def connect(self, ws: WebSocket) -> None:
        """Handle a new WebSocket connection on ``/ws/hub``."""
        await ws.accept()
        client = _Client(ws)

        # Start background producers on first connection.
        if not self._started:
            self._start_producers()
            self._started = True

        # Wait for the subscribe frame.
        try:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=10)
            msg = json.loads(raw)
            requested = msg.get("subscribe", [])
            client.channels = set(requested) & VALID_CHANNELS
        except Exception:
            client.channels = set()

        async with self._lock:
            self._clients.add(client)

        # Acknowledge subscription.
        try:
            await ws.send_text(json.dumps({
                "type": "subscribed",
                "channels": sorted(client.channels),
            }))
        except Exception:
            pass

        # Drain the per-client queue until disconnect.
        try:
            while True:
                frame = await client.queue.get()
                await ws.send_text(frame)
        except (WebSocketDisconnect, Exception):
            pass
        finally:
            async with self._lock:
                self._clients.discard(client)
            try:
                await ws.close()
            except Exception:
                pass

    def broadcast(self, channel: str, data: object) -> None:
        """Push a frame to every client subscribed to *channel*.

        Safe to call from sync code (e.g. the captions router).
        """
        frame = json.dumps({"channel": channel, "data": data})
        # Take a snapshot — iterating over the set must not block.
        clients = list(self._clients)
        for c in clients:
            if channel in c.channels:
                try:
                    c.queue.put_nowait(frame)
                except asyncio.QueueFull:
                    pass  # drop frame for slow consumers

    # ------------------------------------------------------------------
    # Background producers
    # ------------------------------------------------------------------

    def _start_producers(self) -> None:
        self._tasks.append(asyncio.create_task(self._system_loop()))
        self._tasks.append(asyncio.create_task(self._process_status_loop()))
        self._tasks.append(asyncio.create_task(self._metrics_loop()))

    async def _system_loop(self) -> None:
        from ltx_ic_lora_trainer.webui.routers.system import collect_system_info

        while True:
            try:
                data = collect_system_info()
                self.broadcast("system", data)
            except Exception:
                logger.debug("system_loop error", exc_info=True)
            await asyncio.sleep(5)

    async def _process_status_loop(self) -> None:
        while True:
            try:
                pm = self._app.state.process_manager
                data = pm.get_all_statuses()
                self.broadcast("process_status", data)
            except Exception:
                logger.debug("process_status_loop error", exc_info=True)
            await asyncio.sleep(2)

    async def _metrics_loop(self) -> None:
        while True:
            try:
                self._tail_metrics()
            except Exception:
                logger.debug("metrics_loop error", exc_info=True)
            await asyncio.sleep(1)

    def _tail_metrics(self) -> None:
        config = self._app.state.project_config
        if not config or not config.training.output_dir:
            return
        path = os.path.join(config.training.output_dir, "dashboard", "metrics.jsonl")
        if not os.path.exists(path):
            return
        try:
            size = os.path.getsize(path)
        except OSError:
            return
        if size <= self._metrics_last_size:
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                f.seek(self._metrics_last_size)
                new = f.read(size - self._metrics_last_size)
            self._metrics_last_size = size
        except OSError:
            return
        for line in new.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            self.broadcast("metrics", row)
