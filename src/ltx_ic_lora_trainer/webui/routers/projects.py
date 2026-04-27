"""Project configuration API router."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request

from ltx_ic_lora_trainer.webui.project_schema import ProjectConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/project", tags=["project"])


@router.get("/schema")
async def get_project_schema():
    """Return the JSON schema for ProjectConfig, used by the frontend's
    schema-drift test to keep the Zod schema in sync with Pydantic."""
    return ProjectConfig.model_json_schema()


def _get_state(request: Request):
    return request.app.state


def _slugify(name: str) -> str:
    """Convert a project name to a safe filename (without extension)."""
    s = name.strip().lower()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s-]+', '_', s)
    return s or "project"


@router.get("")
async def get_project(request: Request):
    state = _get_state(request)
    config: ProjectConfig | None = state.project_config
    if config is None:
        return {"loaded": False, "config": None, "project_path": None}
    project_path = state.project_path
    return {
        "loaded": True,
        "config": config.model_dump(),
        "project_path": str(project_path) if project_path else None,
    }


@router.post("")
async def create_project(body: dict, request: Request):
    state = _get_state(request)
    try:
        config = ProjectConfig(**body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not config.project_dir:
        raise HTTPException(status_code=400, detail="project_dir is required")

    # Keep canonical filename for compatibility with directory-based loading.
    project_json = Path(config.project_dir) / "project.json"

    # If canonical file exists, add a numeric suffix based on project name.
    if project_json.exists():
        for i in range(2, 100):
            candidate = Path(config.project_dir) / f"{_slugify(config.name)}_{i}.json"
            if not candidate.exists():
                project_json = candidate
                break
        else:
            raise HTTPException(
                status_code=409,
                detail=f"Too many project files with name '{config.name}' in {config.project_dir}.",
            )

    Path(config.project_dir).mkdir(parents=True, exist_ok=True)
    config.save(project_json)
    state.project_config = config
    state.project_path = project_json
    return {
        "ok": True,
        "config": config.model_dump(),
        "project_path": str(project_json),
    }


@router.put("")
async def update_project(body: dict, request: Request):
    state = _get_state(request)
    config: ProjectConfig | None = state.project_config
    if config is None:
        raise HTTPException(status_code=400, detail="No project loaded")

    try:
        updated = ProjectConfig(**body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    project_path = state.project_path
    updated.save(project_path)
    state.project_config = updated
    return {"ok": True, "config": updated.model_dump()}


@router.delete("")
async def close_project(request: Request):
    state = _get_state(request)
    state.project_config = None
    state.project_path = None
    return {"ok": True}


@router.post("/load")
async def load_project(body: dict, request: Request):
    state = _get_state(request)
    path_str = body.get("path", "")
    if not path_str:
        raise HTTPException(status_code=400, detail="path is required")

    path = Path(path_str)

    # If user passes a directory, look for project.json inside it
    if path.is_dir():
        path = path / "project.json"

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    try:
        config = ProjectConfig.load(path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to load: {e}")

    state.project_config = config
    state.project_path = path
    return {
        "ok": True,
        "config": config.model_dump(),
        "project_path": str(path),
    }


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

# Media extensions for dataset directory detection (case-insensitive).
_VIDEO_EXTS = frozenset({".mp4", ".webm", ".avi", ".mkv", ".mov"})
_IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".bmp"})
_AUDIO_EXTS = frozenset({".wav", ".flac", ".mp3", ".ogg", ".m4a"})
_MEDIA_EXTS = _VIDEO_EXTS | _IMAGE_EXTS | _AUDIO_EXTS


@router.get("/discover")
async def discover_projects(
    root: str = Query("", description="Root directory to scan. Empty = server CWD."),
    max_depth: int = Query(3, ge=1, le=5),
):
    """Recursively scan *root* for ``project.json`` files and return a list
    of discovered projects with their name, path, and last-modified time.

    Also scans for standalone dataset directories (directories containing
    media files paired with caption ``.txt`` files) so the UI can show
    available datasets even before a project references them.
    """
    scan_root = Path(root) if root else Path.cwd()
    if not scan_root.is_dir():
        raise HTTPException(404, f"Directory not found: {scan_root}")

    projects: list[dict] = []
    datasets: list[dict] = []
    seen_dataset_dirs: set[str] = set()

    def _walk(directory: Path, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(directory.iterdir())
        except (OSError, PermissionError):
            return

        has_media = False
        has_captions = False
        subdirs: list[Path] = []

        for entry in entries:
            name = entry.name
            # Skip hidden / special directories.
            if name.startswith(".") or name in ("node_modules", "__pycache__", "dist", ".git"):
                continue

            if entry.is_file():
                if name == "project.json":
                    _try_add_project(entry, projects)
                ext = entry.suffix.lower()
                if ext in _MEDIA_EXTS:
                    has_media = True
                if ext == ".txt":
                    has_captions = True
            elif entry.is_dir():
                subdirs.append(entry)

        # A directory with media files + caption .txt files looks like a dataset.
        if has_media and has_captions:
            real = str(directory.resolve())
            if real not in seen_dataset_dirs:
                seen_dataset_dirs.add(real)
                media_count = sum(
                    1 for f in directory.iterdir()
                    if f.is_file() and f.suffix.lower() in _MEDIA_EXTS
                )
                siblings = _scan_siblings(directory)
                cache_status = _scan_cache_status(siblings.get("cache_directory"))
                cache_status["total_assets"] = media_count
                toml_config = _parse_existing_toml(directory.parent)
                datasets.append({
                    "name": directory.parent.name,
                    "path": str(directory),
                    "media_count": media_count,
                    "type": _guess_dataset_type(directory),
                    "parent_dir": str(directory.parent),
                    "siblings": siblings,
                    "cache_status": cache_status,
                    "toml_config": toml_config,
                })

        for sub in subdirs:
            _walk(sub, depth + 1)

    _walk(scan_root, 0)

    return {"root": str(scan_root), "projects": projects, "datasets": datasets}


def _try_add_project(path: Path, out: list[dict]) -> None:
    """Try to read a project.json file and add it to the output list."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        name = data.get("name", path.parent.name)
        mtime = os.path.getmtime(path)
    except (OSError, json.JSONDecodeError, ValueError):
        return
    out.append({
        "name": name,
        "path": str(path),
        "project_dir": str(path.parent),
        "mtime": mtime,
    })


def _guess_dataset_type(directory: Path) -> str:
    """Guess the dominant media type in a directory by sampling a few files."""
    counts = {"video": 0, "image": 0, "audio": 0}
    for f in directory.iterdir():
        ext = f.suffix.lower()
        if ext in _VIDEO_EXTS:
            counts["video"] += 1
        elif ext in _IMAGE_EXTS:
            counts["image"] += 1
        elif ext in _AUDIO_EXTS:
            counts["audio"] += 1
        if sum(counts.values()) >= 20:
            break
    return max(counts, key=lambda k: counts[k])


def _scan_siblings(media_dir: Path) -> dict:
    """Given a media directory (e.g. datasets/beeble/videos), probe the
    parent for sibling cache/references/output/logs directories."""
    parent = media_dir.parent
    siblings: dict[str, str] = {}
    for name, key in [
        ("cache", "cache_directory"),
        ("cache_ref", "reference_cache_directory"),
        ("references", "reference_directory"),
        ("output", "output_dir"),
        ("logs", "logging_dir"),
    ]:
        d = parent / name
        if d.is_dir():
            siblings[key] = str(d)
    return siblings


def _scan_cache_status(cache_dir: str | None) -> dict:
    """Count latent and text-encoder cache files in a cache directory."""
    status = {"latent_count": 0, "text_encoder_count": 0, "total_assets": 0}
    if not cache_dir or not os.path.isdir(cache_dir):
        return status
    try:
        for name in os.listdir(cache_dir):
            if name.endswith("_ltx2_te.safetensors"):
                status["text_encoder_count"] += 1
            elif name.endswith("_ltx2.safetensors") or "_ltx2." in name:
                status["latent_count"] += 1
    except OSError:
        pass
    return status


def _parse_existing_toml(parent_dir: Path) -> dict | None:
    """Parse dataset_config.toml from a dataset parent directory (if it exists)."""
    toml_path = parent_dir / "dataset_config.toml"
    if not toml_path.is_file():
        return None
    try:
        import toml as _toml
    except ModuleNotFoundError:
        return None
    try:
        data = _toml.load(str(toml_path))
        # Extract the useful bits for auto-populate.
        result: dict = {}
        general = data.get("general", {})
        if "resolution" in general:
            result["resolution"] = general["resolution"]
        if "caption_extension" in general:
            result["caption_extension"] = general["caption_extension"]
        if "cache_directory" in general:
            result["cache_directory"] = general["cache_directory"]
        if "reference_cache_directory" in general:
            result["reference_cache_directory"] = general["reference_cache_directory"]
        datasets_list = data.get("datasets", [])
        if datasets_list:
            ds = datasets_list[0]
            for key in ("target_frames", "frame_extraction", "target_fps", "num_repeats",
                         "video_directory", "reference_directory"):
                if key in ds:
                    result[key] = ds[key]
        return result if result else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Auto-populate
# ---------------------------------------------------------------------------


@router.post("/auto-populate")
async def auto_populate(body: dict, request: Request):
    """Auto-populate a project's dataset entry and training paths from a
    discovered dataset's sibling directory structure.

    Body: ``{"dataset_index": 0, "discovered": {...}}`` where *discovered*
    is a dataset dict from ``GET /api/project/discover``.
    """
    state = _get_state(request)
    config: ProjectConfig | None = state.project_config
    if config is None:
        raise HTTPException(400, "No project loaded")

    idx = body.get("dataset_index", 0)
    disc = body.get("discovered", {})
    siblings = disc.get("siblings", {})
    toml_cfg = disc.get("toml_config") or {}
    media_path = disc.get("path", "")
    media_type = disc.get("type", "video")

    # Ensure dataset entry exists at the requested index.
    while len(config.dataset.datasets) <= idx:
        from ltx_ic_lora_trainer.webui.project_schema import DatasetEntry
        config.dataset.datasets.append(DatasetEntry())

    ds = config.dataset.datasets[idx]

    # Fill dataset entry paths.
    if not ds.directory and media_path:
        ds.directory = media_path
    ds.type = media_type
    if not ds.cache_directory and "cache_directory" in siblings:
        ds.cache_directory = siblings["cache_directory"]
    if not ds.reference_directory and "reference_directory" in siblings:
        ds.reference_directory = siblings["reference_directory"]
    if not ds.reference_cache_directory and "reference_cache_directory" in siblings:
        ds.reference_cache_directory = siblings["reference_cache_directory"]

    # Fill from TOML config if available.
    if "resolution" in toml_cfg and isinstance(toml_cfg["resolution"], list) and len(toml_cfg["resolution"]) >= 2:
        ds.resolution_w = toml_cfg["resolution"][1]  # TOML uses [H, W]
        ds.resolution_h = toml_cfg["resolution"][0]
    if "target_frames" in toml_cfg:
        frames = toml_cfg["target_frames"]
        ds.target_frames = frames[0] if isinstance(frames, list) else frames
    if "frame_extraction" in toml_cfg:
        ds.frame_extraction = toml_cfg["frame_extraction"]
    if "target_fps" in toml_cfg:
        ds.target_fps = toml_cfg["target_fps"]
    if "caption_extension" in toml_cfg:
        ds.caption_extension = toml_cfg["caption_extension"]
    if "num_repeats" in toml_cfg:
        ds.num_repeats = toml_cfg["num_repeats"]

    # Fill training paths if empty.
    if not config.training.output_dir and "output_dir" in siblings:
        config.training.output_dir = siblings["output_dir"]
    if not config.training.logging_dir and "logging_dir" in siblings:
        config.training.logging_dir = siblings["logging_dir"]

    # Save and return.
    project_path = state.project_path
    config.save(project_path)
    state.project_config = config
    return {"ok": True, "config": config.model_dump()}
