"""Project configuration API router."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile

from ltx_ic_lora_trainer.webui.paths import PROJECTS_DIR, ensure_projects_dir
from ltx_ic_lora_trainer.webui.project_schema import DatasetEntry, ProjectConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/project", tags=["project"])

_IMAGE_THUMB_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _resolve_project_dir(slug: str) -> Path:
    """Resolve a project slug to an absolute directory under PROJECTS_DIR.

    Raises 404 if the directory doesn't exist, 400 if the slug escapes the
    projects directory (path-traversal guard).
    """
    projects_dir = ensure_projects_dir().resolve()
    if not slug or "/" in slug or "\\" in slug or slug.startswith(".."):
        raise HTTPException(status_code=400, detail=f"Invalid project slug: {slug!r}")
    candidate = (projects_dir / slug).resolve()
    try:
        candidate.relative_to(projects_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Project must live under {projects_dir}")
    if not candidate.is_dir():
        raise HTTPException(status_code=404, detail=f"Project not found: {slug}")
    return candidate


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


def _apply_app_managed_paths(config: ProjectConfig) -> None:
    """Force training/inference output paths to the canonical project layout.

    These directories are app-managed — they always live under the project's
    own directory regardless of what the user sent in the request body. The
    UI deliberately does not surface these fields anymore; calling this on
    create, load, and update keeps them locked to:

        <project_dir>/output      — training checkpoints, state, dashboard, samples
        <project_dir>/logs        — tensorboard / wandb logs
        <project_dir>/inference   — generated videos from inference runs
    """
    if not config.project_dir:
        return
    base = Path(config.project_dir)
    config.training.output_dir = str(base / "output")
    config.training.logging_dir = str(base / "logs")
    config.inference.output_dir = str(base / "inference")


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
    """Create a new project under the repo's fixed projects directory.

    The directory layout is hard-coded — any ``project_dir`` value in the
    request body is ignored. Projects always live at
    ``<repo_root>/projects/<slug>/`` so that all training runs are co-located.
    """
    state = _get_state(request)

    # Strip any caller-supplied location: the app owns this decision.
    body = {k: v for k, v in body.items() if k != "project_dir"}

    try:
        config = ProjectConfig(**body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    slug = _slugify(config.name)
    base = ensure_projects_dir() / slug

    # Avoid overwriting an existing project; pick the first free numeric suffix.
    if base.exists():
        for i in range(2, 100):
            candidate = ensure_projects_dir() / f"{slug}_{i}"
            if not candidate.exists():
                base = candidate
                break
        else:
            raise HTTPException(
                status_code=409,
                detail=f"Too many projects with slug '{slug}' under {PROJECTS_DIR}.",
            )

    base.mkdir(parents=True, exist_ok=True)
    config.project_dir = str(base)
    project_json = base / "project.json"

    # Lock training/inference output paths to the project's own directory.
    # These are app-managed and never user-editable.
    _apply_app_managed_paths(config)

    # Each project ships with one default dataset so the user lands on a usable
    # workspace immediately — no "+" click to do anything. The schema still
    # supports multiple datasets per project for advanced cases (mixed media
    # types, separate IC-LoRA reference sets), but the UI defaults to one.
    if not config.dataset.datasets:
        dataset_dir = base / "datasets" / slug
        (dataset_dir / "target").mkdir(parents=True, exist_ok=True)
        (dataset_dir / "reference").mkdir(parents=True, exist_ok=True)
        (dataset_dir / "cache").mkdir(parents=True, exist_ok=True)
        (dataset_dir / "cache_ref").mkdir(parents=True, exist_ok=True)
        config.dataset.datasets.append(
            DatasetEntry(
                name=config.name,
                type="video",
                directory=str(dataset_dir / "target"),
                cache_directory=str(dataset_dir / "cache"),
                reference_directory=str(dataset_dir / "reference"),
                reference_cache_directory=str(dataset_dir / "cache_ref"),
            )
        )

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

    # Re-apply app-managed paths on every save so a malformed body or a
    # stale frontend cache can't leak user-supplied output paths into the
    # config — these are always derived from project_dir.
    _apply_app_managed_paths(updated)

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
    """Load an existing project by slug from the fixed projects directory.

    Body: ``{"slug": "my_lora"}`` or ``{"path": "<repo>/projects/my_lora"}``.
    Paths outside ``<repo_root>/projects/`` are rejected — projects are
    expected to live under the app-managed directory only.
    """
    state = _get_state(request)
    projects_dir = ensure_projects_dir().resolve()

    slug = body.get("slug", "").strip()
    path_str = body.get("path", "").strip()

    if slug:
        candidate = (projects_dir / slug).resolve()
    elif path_str:
        candidate = Path(path_str).resolve()
    else:
        raise HTTPException(status_code=400, detail="slug or path is required")

    # If a directory was passed, look for project.json inside it.
    if candidate.is_dir():
        candidate = candidate / "project.json"

    # Refuse anything outside the managed projects directory.
    try:
        candidate.relative_to(projects_dir)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Project must live under {projects_dir}",
        )

    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {candidate}")

    try:
        config = ProjectConfig.load(candidate)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to load: {e}")

    # Migrate / heal: existing projects on disk may have empty or stale
    # output paths from before they were app-managed. Re-derive them from
    # project_dir and persist if anything actually changed.
    before = (
        config.training.output_dir,
        config.training.logging_dir,
        config.inference.output_dir,
    )
    _apply_app_managed_paths(config)
    after = (
        config.training.output_dir,
        config.training.logging_dir,
        config.inference.output_dir,
    )
    if before != after:
        config.save(candidate)

    state.project_config = config
    state.project_path = candidate
    return {
        "ok": True,
        "config": config.model_dump(),
        "project_path": str(candidate),
    }


# ---------------------------------------------------------------------------
# Per-project lifecycle: rename, delete, thumbnail
# ---------------------------------------------------------------------------


@router.post("/{slug}/rename")
async def rename_project(slug: str, body: dict, request: Request):
    """Rename a project. Updates the directory name AND the config's `name`.

    Body: ``{"name": "New Display Name"}``. The directory is renamed to the
    slugified form of the new name; if that slug is taken, returns 409. The
    project's training output paths and dataset directories are *not*
    rewritten — they continue to point at the old absolute paths inside the
    new directory (because the absolute paths inside `project.json` are
    rewritten to track the move).
    """
    state = _get_state(request)
    new_name = (body.get("name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="name is required")

    new_slug = _slugify(new_name)
    old_dir = _resolve_project_dir(slug)
    projects_dir = ensure_projects_dir().resolve()
    new_dir = projects_dir / new_slug

    if new_slug != slug and new_dir.exists():
        raise HTTPException(
            status_code=409,
            detail=f"A project with slug '{new_slug}' already exists.",
        )

    project_json = old_dir / "project.json"
    if not project_json.exists():
        raise HTTPException(status_code=404, detail="project.json not found")

    try:
        config = ProjectConfig.load(project_json)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to load project: {e}")

    # Move the directory if the slug actually changed.
    if new_slug != slug:
        try:
            old_dir.rename(new_dir)
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Could not rename directory: {e}")
    else:
        new_dir = old_dir

    # Rewrite absolute paths inside the config so dataset entries, caches,
    # and references still resolve. Anything that lived under the old dir
    # gets the prefix swapped; anything else is left alone.
    old_prefix = str(old_dir)
    new_prefix = str(new_dir)
    raw = json.loads(config.model_dump_json())
    raw_str = json.dumps(raw)
    raw_str = raw_str.replace(json.dumps(old_prefix)[1:-1], json.dumps(new_prefix)[1:-1])
    rewritten = json.loads(raw_str)
    rewritten["name"] = new_name
    rewritten["project_dir"] = new_prefix
    new_config = ProjectConfig(**rewritten)
    new_project_json = new_dir / "project.json"
    new_config.save(new_project_json)

    # If this was the loaded project, refresh app state to point at the new
    # location so the UI doesn't go stale.
    loaded_path: Path | None = state.project_path
    if loaded_path is not None and loaded_path.resolve() == project_json.resolve():
        state.project_config = new_config
        state.project_path = new_project_json

    return {
        "ok": True,
        "slug": new_slug,
        "name": new_name,
        "project_path": str(new_project_json),
    }


@router.delete("/{slug}")
async def delete_project(slug: str, request: Request):
    """Permanently delete a project and everything inside its directory.

    If the deleted project is the one currently loaded in app state, app
    state is cleared. This is a destructive, irreversible operation.
    """
    state = _get_state(request)
    project_dir = _resolve_project_dir(slug)
    project_json = project_dir / "project.json"

    # Clear app state first if this is the loaded project, so the frontend
    # doesn't briefly try to read a config whose files just disappeared.
    loaded_path: Path | None = state.project_path
    if loaded_path is not None and loaded_path.resolve() == project_json.resolve():
        state.project_config = None
        state.project_path = None

    try:
        shutil.rmtree(project_dir)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not delete project: {e}")

    return {"ok": True, "slug": slug}


@router.post("/{slug}/thumbnail")
async def upload_project_thumbnail(
    slug: str,
    request: Request,
    file: UploadFile = File(...),
):
    """Upload a thumbnail image for a project. Stored at
    ``<project_dir>/thumbnail.<ext>`` and recorded on `ProjectConfig.thumbnail`.
    """
    state = _get_state(request)
    project_dir = _resolve_project_dir(slug)
    project_json = project_dir / "project.json"

    if not file.filename:
        raise HTTPException(status_code=422, detail="No filename provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in _IMAGE_THUMB_EXTS:
        raise HTTPException(status_code=422, detail=f"Unsupported image format: {ext}")

    # Remove any prior thumbnail with a different extension so we don't
    # leave orphaned files when the user replaces a .jpg with a .png.
    for existing_ext in _IMAGE_THUMB_EXTS:
        old = project_dir / f"thumbnail{existing_ext}"
        if old.exists() and existing_ext != ext:
            try:
                old.unlink()
            except OSError:
                pass

    thumb_path = project_dir / f"thumbnail{ext}"
    contents = await file.read()
    thumb_path.write_bytes(contents)

    try:
        config = ProjectConfig.load(project_json)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to load project: {e}")
    config.thumbnail = str(thumb_path)
    config.save(project_json)

    # Refresh app state if this is the loaded project.
    loaded_path: Path | None = state.project_path
    if loaded_path is not None and loaded_path.resolve() == project_json.resolve():
        state.project_config = config

    return {"ok": True, "thumbnail": str(thumb_path)}


@router.get("/{slug}/thumbnail")
async def serve_project_thumbnail(slug: str):
    """Serve the project's thumbnail image, if one was uploaded.

    Returns 404 if no thumbnail exists. Path-traversal protected via
    ``_resolve_project_dir``.
    """
    from fastapi.responses import FileResponse

    project_dir = _resolve_project_dir(slug)
    for ext in _IMAGE_THUMB_EXTS:
        candidate = project_dir / f"thumbnail{ext}"
        if candidate.exists():
            return FileResponse(candidate)
    raise HTTPException(status_code=404, detail="No thumbnail")


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
    root: str = Query("", description="Root directory to scan. Empty = the app's managed projects/ directory."),
    max_depth: int = Query(3, ge=1, le=5),
):
    """Recursively scan *root* for ``project.json`` files and return a list
    of discovered projects with their name, path, and last-modified time.

    When ``root`` is omitted, the scan runs against the app-managed
    ``<repo_root>/projects/`` directory. The directory is auto-created on
    first use, so a fresh clone never 404s here.

    Also scans for standalone dataset directories (directories containing
    media files paired with caption ``.txt`` files) so the UI can show
    available datasets even before a project references them.
    """
    scan_root = Path(root) if root else ensure_projects_dir()
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

    # Slug is the directory name (assumes the project lives directly under
    # PROJECTS_DIR, which is the canonical layout). Falls back to "" if not.
    slug = path.parent.name

    # Detect a thumbnail image so the tile grid can render it.
    thumbnail = ""
    for ext in _IMAGE_THUMB_EXTS:
        candidate = path.parent / f"thumbnail{ext}"
        if candidate.exists():
            thumbnail = str(candidate)
            break

    out.append({
        "name": name,
        "slug": slug,
        "path": str(path),
        "project_dir": str(path.parent),
        "mtime": mtime,
        "thumbnail": thumbnail,
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
