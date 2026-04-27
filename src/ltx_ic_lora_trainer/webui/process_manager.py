"""Subprocess manager for caching and training processes.

Each managed process wraps a subprocess with:
- circular log buffer (last 5000 lines)
- live log broadcast to WebSocket subscribers (added for the webui redesign)
- graceful stop → force kill fallback
- thread-safe state tracking

The manager also tracks per-process-type resume state directories
(populated by the pause handler; consumed by the resume handler).
"""

from __future__ import annotations

import logging
import subprocess
import sys
import threading
from collections import deque
from enum import Enum
from typing import Callable, Literal, Optional

logger = logging.getLogger(__name__)

ProcessType = Literal[
    "cache_latents",
    "cache_text",
    "cache_dino",
    "training",
    "inference",
    "slider_training",
    "merge_lora",
]

_PROCESS_TYPES: tuple[str, ...] = (
    "cache_latents",
    "cache_text",
    "cache_dino",
    "training",
    "inference",
    "slider_training",
    "merge_lora",
)

# Windows-specific flags for clean subprocess shutdown via CTRL_BREAK_EVENT.
_CREATION_FLAGS = 0
if sys.platform == "win32":
    _CREATION_FLAGS = subprocess.CREATE_NEW_PROCESS_GROUP


class ProcessState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    STOPPING = "stopping"
    FINISHED = "finished"
    ERROR = "error"


# Signature of a log subscriber callback. One line at a time, already
# containing its trailing newline (or not — callbacks must not rely on it).
LogCallback = Callable[[str], None]


class ManagedProcess:
    """Wraps a subprocess with state tracking, log buffering, and live log broadcast."""

    def __init__(self, cmd: list[str], cwd: Optional[str] = None):
        self.cmd = cmd
        self.cwd = cwd
        self.state = ProcessState.IDLE
        self.exit_code: Optional[int] = None
        self.logs: deque[str] = deque(maxlen=5000)
        self._proc: Optional[subprocess.Popen] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        # Log subscribers are separate from the state lock because they may
        # include WebSocket send callbacks that could block briefly.
        self._subscribers: list[LogCallback] = []
        self._subscribers_lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self.state == ProcessState.RUNNING:
                raise RuntimeError("Process already running")

            self.state = ProcessState.RUNNING
            self.exit_code = None
            self.logs.clear()
            self._append_and_broadcast(f"$ {' '.join(self.cmd)}\n")

            self._proc = subprocess.Popen(
                self.cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=self.cwd,
                creationflags=_CREATION_FLAGS,
                bufsize=1,
                text=True,
                encoding="utf-8",
                errors="replace",
            )

            self._reader_thread = threading.Thread(
                target=self._read_output, daemon=True
            )
            self._reader_thread.start()

    def _read_output(self) -> None:
        try:
            assert self._proc and self._proc.stdout
            for line in self._proc.stdout:
                self._append_and_broadcast(line)
            self._proc.wait()
        except Exception as e:
            self._append_and_broadcast(f"\n[Process reader error: {e}]\n")

        with self._lock:
            self.exit_code = self._proc.returncode if self._proc else -1
            if self.state == ProcessState.STOPPING:
                self.state = ProcessState.FINISHED
            elif self.exit_code == 0:
                self.state = ProcessState.FINISHED
            else:
                self.state = ProcessState.ERROR
        self._append_and_broadcast(f"\n[Process exited with code {self.exit_code}]\n")

    def _append_and_broadcast(self, line: str) -> None:
        """Append to circular buffer and broadcast to all subscribers.

        Broadcasting happens OUTSIDE the buffer append so a slow / crashed
        subscriber cannot block writes to the log buffer.
        """
        self.logs.append(line)
        # Snapshot under lock, then call outside to avoid holding the lock
        # during potentially blocking callbacks.
        with self._subscribers_lock:
            subs = list(self._subscribers)
        for cb in subs:
            try:
                cb(line)
            except Exception:
                # One dead subscriber shouldn't kill logging for the rest.
                # Don't log here either — it would recurse through the same path.
                pass

    def terminate(self) -> None:
        with self._lock:
            if self.state != ProcessState.RUNNING:
                return
            self.state = ProcessState.STOPPING

        self._append_and_broadcast("\n[Stopping process...]\n")

        if self._proc:
            try:
                if sys.platform == "win32":
                    # Windows: send CTRL_BREAK_EVENT to the process group
                    # created via CREATE_NEW_PROCESS_GROUP so accelerate and
                    # the training script can shut down gracefully
                    # (write out save_state_on_train_end etc.).
                    import signal as _signal
                    self._proc.send_signal(_signal.CTRL_BREAK_EVENT)
                else:
                    self._proc.terminate()
            except Exception as e:
                self._append_and_broadcast(f"\n[terminate() error: {e}]\n")
            # Wait up to 30s then force kill — gives the training script time
            # to run save_state_on_train_end before we pull the plug.
            t = threading.Thread(target=self._force_kill, daemon=True)
            t.start()

    def _force_kill(self) -> None:
        if self._proc:
            try:
                self._proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self._append_and_broadcast("\n[Force killing process...]\n")
                self._proc.kill()

    def get_status(self) -> dict:
        return {
            "state": self.state.value,
            "exit_code": self.exit_code,
        }

    def get_logs(self, last_n: Optional[int] = None) -> list[str]:
        if last_n is None:
            return list(self.logs)
        return list(self.logs)[-last_n:]

    # -- log subscription (for WebSocket live streaming) --

    def subscribe(self, callback: LogCallback) -> None:
        """Register a callback that fires for every new log line.

        Subscribers do NOT receive the current buffer — the caller is
        responsible for dumping ``get_logs()`` before subscribing if it
        wants history.
        """
        with self._subscribers_lock:
            self._subscribers.append(callback)

    def unsubscribe(self, callback: LogCallback) -> None:
        with self._subscribers_lock:
            try:
                self._subscribers.remove(callback)
            except ValueError:
                pass


class ProcessManager:
    """Manages subprocess slots for cache/training/inference/slider/merge jobs."""

    def __init__(self):
        self._processes: dict[str, ManagedProcess] = {}
        self._resume_state_dirs: dict[str, Optional[str]] = {}
        self._lock = threading.Lock()

    def start(self, proc_type: ProcessType, cmd: list[str], cwd: Optional[str] = None) -> None:
        with self._lock:
            existing = self._processes.get(proc_type)
            if existing and existing.state == ProcessState.RUNNING:
                raise RuntimeError(f"{proc_type} is already running")

            mp = ManagedProcess(cmd, cwd=cwd)
            self._processes[proc_type] = mp
            # An explicit start clears any stashed resume state for this
            # process type — the user is starting fresh, not resuming.
            self._resume_state_dirs[proc_type] = None

        mp.start()
        logger.info(f"Started {proc_type}: {' '.join(cmd[:5])}...")

    def stop(self, proc_type: ProcessType) -> None:
        with self._lock:
            mp = self._processes.get(proc_type)
            if not mp:
                return
        mp.terminate()

    def get_status(self, proc_type: ProcessType) -> dict:
        mp = self._processes.get(proc_type)
        if not mp:
            return {"state": ProcessState.IDLE.value, "exit_code": None}
        return mp.get_status()

    def get_logs(self, proc_type: ProcessType, last_n: Optional[int] = None) -> list[str]:
        mp = self._processes.get(proc_type)
        if not mp:
            return []
        return mp.get_logs(last_n)

    def get_all_statuses(self) -> dict[str, dict]:
        result = {}
        for pt in _PROCESS_TYPES:
            result[pt] = self.get_status(pt)
        return result

    # -- log subscription passthrough --

    def subscribe_logs(self, proc_type: ProcessType, callback: LogCallback) -> None:
        """Subscribe to live log broadcasts for ``proc_type``.

        If the process does not yet exist, no-op — caller should still call
        ``unsubscribe_logs`` on the same callback when done. Subscribers
        persist across restarts of the same proc_type slot because they are
        attached to the new ``ManagedProcess`` instance at subscription time.
        """
        mp = self._processes.get(proc_type)
        if mp is not None:
            mp.subscribe(callback)

    def unsubscribe_logs(self, proc_type: ProcessType, callback: LogCallback) -> None:
        mp = self._processes.get(proc_type)
        if mp is not None:
            mp.unsubscribe(callback)

    # -- resume state tracking --

    def set_resume_state_dir(self, proc_type: ProcessType, path: Optional[str]) -> None:
        with self._lock:
            self._resume_state_dirs[proc_type] = path

    def get_resume_state_dir(self, proc_type: ProcessType) -> Optional[str]:
        return self._resume_state_dirs.get(proc_type)

    def clear_resume_state_dir(self, proc_type: ProcessType) -> None:
        with self._lock:
            self._resume_state_dirs[proc_type] = None

    # -- pipeline orchestration --

    def start_pipeline(
        self,
        steps: list[tuple[str, list[str]]],
        cwd: Optional[str] = None,
    ) -> "Pipeline":
        """Launch a sequential pipeline. Each step runs to completion
        before the next begins. On error the pipeline stops."""
        pipeline = Pipeline(steps, self, cwd)
        self._active_pipeline = pipeline
        pipeline.start()
        return pipeline

    def cancel_pipeline(self) -> None:
        pipeline: Pipeline | None = getattr(self, "_active_pipeline", None)
        if pipeline:
            pipeline.cancel()
            self._active_pipeline = None

    def get_pipeline_status(self) -> dict:
        pipeline: Pipeline | None = getattr(self, "_active_pipeline", None)
        if not pipeline or not pipeline.active:
            return {"active": False}
        return {
            "active": True,
            "current_step": pipeline.current_index,
            "current_type": (
                pipeline.steps[pipeline.current_index][0]
                if pipeline.current_index < len(pipeline.steps)
                else None
            ),
            "total_steps": len(pipeline.steps),
            "step_names": [s[0] for s in pipeline.steps],
        }


class Pipeline:
    """Runs a sequence of (proc_type, cmd) steps one after another in a
    background thread. Stops on error or cancellation."""

    def __init__(
        self,
        steps: list[tuple[str, list[str]]],
        manager: ProcessManager,
        cwd: Optional[str] = None,
    ):
        self.steps = steps
        self.manager = manager
        self.cwd = cwd
        self.current_index = 0
        self.active = True
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def cancel(self) -> None:
        self.active = False
        if self.current_index < len(self.steps):
            proc_type = self.steps[self.current_index][0]
            self.manager.stop(proc_type)

    def _run(self) -> None:
        import time

        for i, (proc_type, cmd) in enumerate(self.steps):
            if not self.active:
                break
            self.current_index = i
            try:
                self.manager.start(proc_type, cmd, cwd=self.cwd)
            except RuntimeError:
                # Already running — wait for it to finish.
                pass

            # Poll until the process finishes.
            while self.active:
                status = self.manager.get_status(proc_type)
                state = status.get("state", "idle")
                if state in ("finished", "error", "idle"):
                    break
                time.sleep(0.5)

            if not self.active:
                break
            if status.get("state") == "error":
                logger.warning(f"Pipeline stopped: {proc_type} exited with error")
                break

        self.active = False
