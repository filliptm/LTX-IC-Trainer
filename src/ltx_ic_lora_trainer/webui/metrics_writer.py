"""JSONL metrics writer for training runs.

Writes three files under ``<run_dir>/dashboard/``:
- ``metrics.jsonl`` — one JSON object per training step (append-only)
- ``status.json`` — current run status (last-write-wins)
- ``events.jsonl`` — sparse event log (checkpoint saves, sampling, etc.)

This module replaces the Parquet-based MetricsWriter from the old dashboard.
JSONL is simpler, human-readable, trivially tailable, and has no `pyarrow`
dependency.
"""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Optional

METRIC_FIELDS = ("step", "epoch", "loss", "avr_loss", "loss_v", "loss_a", "lr", "step_time")


class MetricsWriter:
    """Append-only JSONL writer for training metrics."""

    def __init__(self, run_dir: str, flush_every: int = 10):
        self.run_dir = run_dir
        self.flush_every = flush_every

        dashboard = os.path.join(run_dir, "dashboard")
        os.makedirs(dashboard, exist_ok=True)

        self.metrics_path = os.path.join(dashboard, "metrics.jsonl")
        self.status_path = os.path.join(dashboard, "status.json")
        self.events_path = os.path.join(dashboard, "events.jsonl")

        self._buffer: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._start_time = time.monotonic()
        self._step_count = 0

        # Initialize status
        self.update_status(step=0, max_steps=0, epoch=0, max_epochs=0, status="initializing")

    # -- public API --

    def log(
        self,
        step: int,
        epoch: int = 0,
        loss: float = 0.0,
        avr_loss: float = 0.0,
        loss_v: Optional[float] = None,
        loss_a: Optional[float] = None,
        lr: float = 0.0,
        step_time: float = 0.0,
    ) -> None:
        row = {
            "step": step,
            "epoch": epoch,
            "loss": loss,
            "avr_loss": avr_loss,
            "loss_v": loss_v if loss_v is not None else None,
            "loss_a": loss_a if loss_a is not None else None,
            "lr": lr,
            "step_time": step_time,
        }
        with self._lock:
            self._buffer.append(row)
            self._step_count += 1
            if len(self._buffer) >= self.flush_every:
                self._flush_background()

    def log_event(self, event_type: str, step: int, **extra) -> None:
        entry = {"type": event_type, "step": step, "time": time.time(), **extra}
        t = threading.Thread(target=self._append_event, args=(entry,), daemon=True)
        t.start()

    def update_status(self, **kw) -> None:
        elapsed = time.monotonic() - self._start_time
        speed = self._step_count / elapsed if elapsed > 0 and self._step_count > 0 else 0.0
        status = {
            "elapsed_sec": round(elapsed, 1),
            "speed_steps_per_sec": round(speed, 4),
            "time": time.time(),
        }
        status.update(kw)
        t = threading.Thread(target=self._write_json_atomic, args=(self.status_path, status), daemon=True)
        t.start()

    def flush(self) -> None:
        with self._lock:
            if self._buffer:
                self._do_flush(list(self._buffer))
                self._buffer.clear()

    def close(self) -> None:
        self.flush()

    # -- internals --

    def _flush_background(self) -> None:
        rows = list(self._buffer)
        self._buffer.clear()
        t = threading.Thread(target=self._do_flush, args=(rows,), daemon=True)
        t.start()

    def _do_flush(self, rows: list[dict]) -> None:
        """Append rows to metrics.jsonl. One JSON object per line."""
        try:
            with open(self.metrics_path, "a", encoding="utf-8") as f:
                for row in rows:
                    f.write(json.dumps(row, separators=(",", ":"), default=_json_default))
                    f.write("\n")
        except Exception:
            # Deliberately silent — losing a metrics row must never crash training.
            pass

    def _append_event(self, entry: dict) -> None:
        try:
            with open(self.events_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, separators=(",", ":"), default=_json_default))
                f.write("\n")
        except Exception:
            pass

    @staticmethod
    def _write_json_atomic(path: str, data) -> None:
        tmp = path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, default=_json_default)
            os.replace(tmp, path)
        except Exception:
            pass


def _json_default(obj):
    """Convert numpy / torch scalars and unknown objects to plain Python."""
    try:
        import numpy as np

        if isinstance(obj, np.generic):
            return obj.item()
    except ImportError:
        pass
    try:
        import torch

        if isinstance(obj, torch.Tensor):
            return obj.item() if obj.numel() == 1 else obj.tolist()
    except ImportError:
        pass
    return str(obj)


def create_metrics_writer(run_dir: str, flush_every: int = 10) -> MetricsWriter:
    """Factory used by the base trainer's --gui lazy import."""
    return MetricsWriter(run_dir, flush_every=flush_every)
