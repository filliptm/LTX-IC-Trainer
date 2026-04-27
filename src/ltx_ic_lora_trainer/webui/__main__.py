"""Entry point for `python -m ltx_ic_lora_trainer.webui`."""

import argparse
import logging
import os
import signal
import subprocess
import sys

import uvicorn

from ltx_ic_lora_trainer.webui.server import create_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")


def main() -> None:
    parser = argparse.ArgumentParser(description="LTX-2 Training Manager (webui)")
    parser.add_argument("--port", type=int, default=7860, help="Server port (default: 7860)")
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Server host (default: 127.0.0.1 — pass 0.0.0.0 for LAN access)",
    )
    parser.add_argument("--project", type=str, default=None, help="Path to project.json to load on startup")
    parser.add_argument("--dev", action="store_true", help="Start Vite dev server alongside the API backend")
    parser.add_argument("--dev-port", type=int, default=5173, help="Vite dev server port (default: 5173)")
    args = parser.parse_args()

    vite_proc = None
    if args.dev:
        vite_proc = _start_vite(args.dev_port)

    app = create_app(project_path=args.project)

    url = f"http://localhost:{args.dev_port}" if args.dev else f"http://{args.host}:{args.port}"
    logger.info(f"Starting LTX-2 webui — open {url}")

    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    finally:
        if vite_proc is not None:
            _stop_vite(vite_proc)


def _start_vite(port: int) -> subprocess.Popen:
    """Spawn `pnpm dev` in the frontend directory."""
    pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    logger.info(f"Starting Vite dev server via pnpm on port {port} ...")
    proc = subprocess.Popen(
        [pnpm_cmd, "dev", "--port", str(port)],
        cwd=FRONTEND_DIR,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    return proc


def _stop_vite(proc: subprocess.Popen) -> None:
    """Terminate the Vite dev server."""
    if proc.poll() is not None:
        return
    logger.info("Stopping Vite dev server ...")
    if sys.platform == "win32":
        try:
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        except Exception:
            proc.terminate()
    else:
        proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


if __name__ == "__main__":
    main()
