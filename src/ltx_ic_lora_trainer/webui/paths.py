"""Filesystem layout constants for the webui.

Projects live under a single fixed directory inside the repo root so that
training runs are co-located, discoverable, and never scattered across the
filesystem. This module is the one place that decides where that is.
"""

from __future__ import annotations

from pathlib import Path

import ltx_ic_lora_trainer

# Resolve the repo root from the package location:
# <repo_root>/src/ltx_ic_lora_trainer/__init__.py  →  parents[2]
REPO_ROOT: Path = Path(ltx_ic_lora_trainer.__file__).resolve().parents[2]

# All projects created via the webui live here. Auto-created on first write.
PROJECTS_DIR: Path = REPO_ROOT / "projects"


def ensure_projects_dir() -> Path:
    """Create the projects directory if it doesn't exist and return it."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    return PROJECTS_DIR
