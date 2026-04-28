"""Dataset configuration API router."""

from __future__ import annotations

import math
import os
import re
import unicodedata
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ltx_ic_lora_trainer.webui.toml_export import export_dataset_toml
from ltx_ic_lora_trainer.webui.project_schema import DatasetConfig, DatasetEntry, ProjectConfig

router = APIRouter(prefix="/api/dataset", tags=["dataset"])

_VIDEO_EXTS = frozenset({".mp4", ".webm", ".avi", ".mkv", ".mov"})
_IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".bmp"})
_AUDIO_EXTS = frozenset({".wav", ".flac", ".mp3", ".ogg", ".m4a"})
_MEDIA_EXTS = _VIDEO_EXTS | _IMAGE_EXTS | _AUDIO_EXTS
_IMAGE_THUMB_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp"})


def _classify(ext: str) -> str | None:
    """Return 'video', 'image', 'audio', or None."""
    low = ext.lower()
    if low in _VIDEO_EXTS:
        return "video"
    if low in _IMAGE_EXTS:
        return "image"
    if low in _AUDIO_EXTS:
        return "audio"
    return None


def _get_config(request: Request) -> ProjectConfig:
    config = request.app.state.project_config
    if config is None:
        raise HTTPException(status_code=400, detail="No project loaded")
    return config


def _slugify(name: str) -> str:
    """Convert a display name to a filesystem-safe slug."""
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = name.lower().strip()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"[\s_]+", "-", name)
    name = re.sub(r"-+", "-", name).strip("-")
    return name or "dataset"


# ---------------------------------------------------------------------------
# Bucket-preview helpers (Phase 2 of the bucket-aware resolution UI)
#
# These mirror BucketSelector in
# src/ltx_ic_lora_trainer/dataset/image_video_dataset.py so the webui can
# preview which buckets a dataset will populate without importing the
# dataset machinery into the router. If the upstream algorithm changes,
# these helpers will silently drift — keep an eye on the source line ranges
# referenced below.
# ---------------------------------------------------------------------------


def _divisible_by(n: int, d: int) -> int:
    return n - (n % d)


def _compute_buckets(target_w: int, target_h: int, reso_steps: int = 32) -> list[tuple[int, int]]:
    """Reproduce BucketSelector's bucket family for an LTX-2 target area.

    Mirrors BucketSelector.__init__ in image_video_dataset.py (lines 439-448).
    Reimplemented here to keep the webui router decoupled from dataset code.
    """
    bucket_area = target_w * target_h
    sqrt_size = int(math.sqrt(bucket_area))
    min_size = _divisible_by(sqrt_size // 2, reso_steps)
    buckets: list[tuple[int, int]] = []
    for w in range(min_size, sqrt_size + reso_steps, reso_steps):
        if w <= 0:
            continue
        h = _divisible_by(bucket_area // w, reso_steps)
        if h <= 0:
            continue
        buckets.append((w, h))
        buckets.append((h, w))
    return sorted(set(buckets))


def _nearest_bucket(image_size: tuple[int, int], buckets: list[tuple[int, int]]) -> Optional[tuple[int, int]]:
    """Mirrors BucketSelector.get_bucket_resolution lines 464-467."""
    w, h = image_size
    if w <= 0 or h <= 0 or not buckets:
        return None
    aspect = w / h
    return min(buckets, key=lambda b: abs((b[0] / b[1]) - aspect))


def _probe_image(path: str) -> Optional[tuple[int, int]]:
    """Header-only read; PIL.Image.open is lazy and only reads metadata for .size."""
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def _probe_video(path: str) -> Optional[tuple[int, int]]:
    """Container-only read; cv2.VideoCapture.get(CAP_PROP_FRAME_*) doesn't decode."""
    try:
        import cv2
        cap = cv2.VideoCapture(path)
        try:
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        finally:
            cap.release()
        return (w, h) if w > 0 and h > 0 else None
    except Exception:
        return None


def _probe_dimensions(path: str, ext_kind: str) -> Optional[tuple[int, int]]:
    if ext_kind == "image":
        return _probe_image(path)
    if ext_kind == "video":
        return _probe_video(path)
    return None  # audio + unknown skipped


# ---------------------------------------------------------------------------
# Existing endpoints: config, TOML export, cache status
# ---------------------------------------------------------------------------


@router.get("/config")
async def get_dataset_config(request: Request):
    config = _get_config(request)
    return config.dataset.model_dump()


@router.put("/config")
async def update_dataset_config(body: dict, request: Request):
    config = _get_config(request)
    try:
        config.dataset = DatasetConfig(**body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    config.save()
    return {"ok": True, "config": config.dataset.model_dump()}


@router.post("/export-toml")
async def export_toml(request: Request):
    config = _get_config(request)
    if not config.project_dir:
        raise HTTPException(status_code=400, detail="project_dir not set")

    try:
        path = export_dataset_toml(config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"ok": True, "path": str(path)}


@router.get("/preview-toml")
async def preview_toml(request: Request):
    """Return what the TOML file would look like without writing it."""
    config = _get_config(request)


    # Generate TOML content as string
    doc: dict = {}
    doc["general"] = {
        "enable_bucket": config.dataset.general.enable_bucket,
        "bucket_no_upscale": config.dataset.general.bucket_no_upscale,
    }

    from ltx_ic_lora_trainer.webui.toml_export import _toml_value

    datasets = []
    for entry in config.dataset.datasets:
        d: dict = {}
        if entry.type == "video":
            d["video_directory"] = entry.directory
        elif entry.type == "image":
            d["image_directory"] = entry.directory
        elif entry.type == "audio":
            d["audio_directory"] = entry.directory
        d["cache_directory"] = entry.cache_directory
        if entry.type != "audio":
            d["resolution"] = [entry.resolution_w, entry.resolution_h]
        d["batch_size"] = entry.batch_size
        d["num_repeats"] = entry.num_repeats
        d["caption_extension"] = entry.caption_extension
        if entry.type == "video":
            d["target_frames"] = [entry.target_frames]
            d["frame_extraction"] = entry.frame_extraction
            if entry.frame_sample is not None:
                d["frame_sample"] = entry.frame_sample
        datasets.append(d)
    doc["datasets"] = datasets

    if config.dataset.validation_datasets:
        val = []
        for entry in config.dataset.validation_datasets:
            d = {}
            if entry.type == "video":
                d["video_directory"] = entry.directory
            elif entry.type == "image":
                d["image_directory"] = entry.directory
            elif entry.type == "audio":
                d["audio_directory"] = entry.directory
            d["cache_directory"] = entry.cache_directory
            if entry.type != "audio":
                d["resolution"] = [entry.resolution_w, entry.resolution_h]
            d["batch_size"] = entry.batch_size
            d["num_repeats"] = entry.num_repeats
            d["caption_extension"] = entry.caption_extension
            if entry.type == "video":
                d["target_frames"] = [entry.target_frames]
                d["frame_extraction"] = entry.frame_extraction
            val.append(d)
        doc["validation_datasets"] = val

    # Build TOML string
    lines = []
    if "general" in doc:
        lines.append("[general]")
        for k, v in doc["general"].items():
            lines.append(f"{k} = {_toml_value(v)}")
        lines.append("")
    for section_name in ("datasets", "validation_datasets"):
        if section_name not in doc:
            continue
        for entry in doc[section_name]:
            lines.append(f"[[{section_name}]]")
            for k, v in entry.items():
                lines.append(f"{k} = {_toml_value(v)}")
            lines.append("")

    return {"toml": "\n".join(lines)}


@router.get("/cache-status")
async def get_cache_status(request: Request):
    """Report cache completeness for each dataset entry."""
    config = _get_config(request)
    results = []
    for i, ds in enumerate(config.dataset.datasets):
        entry: dict = {
            "index": i,
            "directory": ds.directory,
            "cache_directory": ds.cache_directory,
            "total_assets": 0,
            "latent_cached": 0,
            "text_cached": 0,
            "needs_text_cache": True,
            "needs_latent_cache": True,
        }

        # Count media files in the dataset directory.
        if ds.directory and os.path.isdir(ds.directory):
            entry["total_assets"] = sum(
                1 for f in Path(ds.directory).iterdir()
                if f.is_file() and f.suffix.lower() in _MEDIA_EXTS
            )

        # Count cached files.
        if ds.cache_directory and os.path.isdir(ds.cache_directory):
            for name in os.listdir(ds.cache_directory):
                if name.endswith("_ltx2_te.safetensors"):
                    entry["text_cached"] += 1
                elif "_ltx2" in name and name.endswith(".safetensors"):
                    entry["latent_cached"] += 1

        total = entry["total_assets"]
        entry["needs_text_cache"] = total > 0 and entry["text_cached"] < total
        entry["needs_latent_cache"] = total > 0 and entry["latent_cached"] < total
        results.append(entry)

    return {"datasets": results}


# ---------------------------------------------------------------------------
# POST /api/dataset/create — create a new managed dataset
# ---------------------------------------------------------------------------


class DatasetCreateBody(BaseModel):
    name: str
    type: str = "video"


@router.post("/create")
async def create_dataset(body: DatasetCreateBody, request: Request):
    """Create a new named dataset with auto-managed directory structure."""
    config = _get_config(request)
    if not config.project_dir:
        raise HTTPException(status_code=400, detail="project_dir not set")

    if body.type not in ("video", "image", "audio"):
        raise HTTPException(status_code=422, detail=f"Invalid type: {body.type}")

    slug = _slugify(body.name)
    if not slug:
        raise HTTPException(status_code=422, detail="Name results in empty slug")

    # Ensure unique directory name
    base = Path(config.project_dir) / "datasets" / slug
    counter = 2
    original_base = base
    while base.exists():
        base = original_base.with_name(f"{original_base.name}_{counter}")
        counter += 1

    # Create directory structure
    (base / "target").mkdir(parents=True, exist_ok=True)
    (base / "reference").mkdir(parents=True, exist_ok=True)
    (base / "cache").mkdir(parents=True, exist_ok=True)
    (base / "cache_ref").mkdir(parents=True, exist_ok=True)

    entry = DatasetEntry(
        name=body.name,
        type=body.type,
        directory=str(base / "target"),
        cache_directory=str(base / "cache"),
        reference_directory=str(base / "reference"),
        reference_cache_directory=str(base / "cache_ref"),
    )

    config.dataset.datasets.append(entry)
    config.save()

    index = len(config.dataset.datasets) - 1
    return {"ok": True, "index": index, "entry": entry.model_dump()}


# ---------------------------------------------------------------------------
# DELETE /api/dataset/{index} — remove a dataset entry (keeps files on disk)
# ---------------------------------------------------------------------------


@router.delete("/{index}")
async def delete_dataset(index: int, request: Request):
    """Remove a dataset entry from the project. Does NOT delete files on disk."""
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    datasets.pop(index)
    config.save()
    return {"ok": True}


# ---------------------------------------------------------------------------
# PATCH /api/dataset/{index}/rename — rename the display name only
# ---------------------------------------------------------------------------


class DatasetRenameBody(BaseModel):
    name: str


@router.patch("/{index}/rename")
async def rename_dataset(index: int, body: DatasetRenameBody, request: Request):
    """Rename a dataset entry's display name in-place.

    Only the ``name`` field changes. Directories on disk are *not* moved —
    rewriting cache paths after a rename is brittle (cached safetensors
    embed dataset directory paths in their metadata), so the slug-derived
    directory layout is preserved as-is.
    """
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="name is required")

    datasets[index].name = new_name
    config.save()
    return {"ok": True, "name": new_name}


# ---------------------------------------------------------------------------
# POST /api/dataset/{index}/thumbnail — set a dataset thumbnail
# ---------------------------------------------------------------------------


@router.post("/{index}/thumbnail")
async def set_thumbnail(
    index: int,
    request: Request,
    file: UploadFile = File(...),
):
    """Upload a thumbnail image for a dataset."""
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    entry = datasets[index]
    if not file.filename:
        raise HTTPException(status_code=422, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in _IMAGE_THUMB_EXTS:
        raise HTTPException(status_code=422, detail=f"Unsupported image format: {ext}")

    # Save thumbnail alongside the dataset's target directory
    dataset_base = Path(entry.directory).parent if entry.directory else None
    if dataset_base is None or not dataset_base.exists():
        raise HTTPException(status_code=400, detail="Dataset directory not found")

    thumb_path = dataset_base / f"thumbnail{ext}"
    content = await file.read()
    thumb_path.write_bytes(content)

    entry.thumbnail = str(thumb_path)
    config.save()

    return {"ok": True, "path": str(thumb_path)}


# ---------------------------------------------------------------------------
# GET /api/dataset/{index}/assets — get paired assets for a dataset
# ---------------------------------------------------------------------------


@router.get("/{index}/assets")
async def get_dataset_assets(
    index: int,
    request: Request,
    caption_extension: str = Query(".txt"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    """List media assets in a dataset with caption text and reference pairing."""
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    entry = datasets[index]
    target_dir = entry.directory
    ref_dir = entry.reference_directory

    # Build maps of stem -> filename for both sides (media files only)
    def scan_dir(path: str) -> dict[str, str]:
        out: dict[str, str] = {}
        if not path or not os.path.isdir(path):
            return out
        for name in os.listdir(path):
            full = os.path.join(path, name)
            if not os.path.isfile(full):
                continue
            ext = os.path.splitext(name)[1]
            if _classify(ext) is None:
                continue
            stem = os.path.splitext(name)[0]
            # First match wins (stable filesystem sort)
            if stem not in out:
                out[stem] = name
        return out

    target_map = scan_dir(target_dir)
    ref_map = scan_dir(ref_dir)

    if not target_map and not ref_map:
        return {"total": 0, "assets": []}

    # Walk the union of stems, preferring target-side filename for display
    all_stems = sorted(set(target_map.keys()) | set(ref_map.keys()))

    assets: list[dict] = []
    for stem in all_stems:
        target_name = target_map.get(stem)
        ref_name = ref_map.get(stem)

        # Pick the asset type from whichever side exists (target wins)
        display_name = target_name or ref_name
        if display_name is None:
            continue
        asset_type = _classify(os.path.splitext(display_name)[1])
        if asset_type is None:
            continue

        # Caption is stored alongside the target (or reference if no target)
        caption_base = target_dir if target_name else ref_dir
        caption_path = os.path.join(caption_base, stem + caption_extension)
        caption_text = ""
        has_caption = os.path.isfile(caption_path)
        if has_caption:
            try:
                caption_text = Path(caption_path).read_text(encoding="utf-8")
            except OSError:
                pass

        # File size: prefer target, fall back to reference
        size = 0
        size_source = (target_dir, target_name) if target_name else (ref_dir, ref_name)
        if size_source[0] and size_source[1]:
            try:
                size = os.path.getsize(os.path.join(size_source[0], size_source[1]))
            except OSError:
                size = 0

        assets.append({
            "filename": display_name,
            "type": asset_type,
            "size_bytes": size,
            "has_caption": has_caption,
            "caption_text": caption_text,
            "has_target": target_name is not None,
            "target_filename": target_name,
            "has_reference": ref_name is not None,
            "reference_filename": ref_name,
        })

    total = len(assets)
    page = assets[offset: offset + limit]
    return {"total": total, "assets": page}


# ---------------------------------------------------------------------------
# GET /api/dataset/{index}/buckets — preview bucket assignment histogram
# ---------------------------------------------------------------------------


@router.get("/{index}/buckets")
async def get_dataset_buckets(
    index: int,
    request: Request,
    width: Optional[int] = Query(None, ge=64, le=8192),
    height: Optional[int] = Query(None, ge=64, le=8192),
    slot: str = Query("target"),
    max_files: int = Query(2000, ge=1, le=10000),
):
    """Preview which LTX-2 buckets the dataset's files will land in for a
    given target (W, H) area.

    The trainer (BucketSelector) generates a 32-pixel-grid family of bucket
    resolutions sharing the target area, in both portrait and landscape
    orientations, and assigns each clip to the nearest aspect-ratio match.
    This route reproduces that math without importing the dataset code, so
    the UI can show "given my target area + my files, here's what training
    will actually use."

    Empty / unreadable / capped cases all return 200 with a structured
    response — the frontend renders graceful states.
    """
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    entry = datasets[index]

    if slot == "target":
        base_dir = entry.directory
    elif slot == "reference":
        base_dir = entry.reference_directory
    else:
        raise HTTPException(status_code=422, detail=f"Invalid slot: {slot}")

    if not base_dir:
        raise HTTPException(status_code=400, detail=f"No {slot} directory configured for this dataset")

    target_w = width if width is not None else entry.resolution_w
    target_h = height if height is not None else entry.resolution_h
    if target_w <= 0 or target_h <= 0:
        raise HTTPException(status_code=422, detail="Target width/height must be positive")

    real_base = os.path.realpath(base_dir)
    if not os.path.isdir(real_base):
        raise HTTPException(status_code=404, detail="Dataset directory not found")

    buckets = _compute_buckets(target_w, target_h)
    if not buckets:
        return {
            "target_area": target_w * target_h,
            "target_resolution": [target_w, target_h],
            "buckets": [],
            "unreadable": [],
            "scanned": 0,
            "truncated": False,
        }

    assignments: dict[tuple[int, int], list[str]] = {}
    unreadable: list[str] = []
    scanned = 0
    truncated = False

    try:
        names = sorted(os.listdir(real_base))
    except OSError:
        names = []

    for name in names:
        if name.startswith(".") or name == ".thumbs":
            continue
        full = os.path.join(real_base, name)
        # Defend against symlinks pointing outside the dataset directory.
        real_full = os.path.realpath(full)
        if not real_full.startswith(real_base + os.sep) and real_full != real_base:
            continue
        if not os.path.isfile(real_full):
            continue
        ext = os.path.splitext(name)[1]
        kind = _classify(ext)
        if kind not in ("image", "video"):
            # audio + unknown skipped — they don't have spatial buckets.
            continue
        if scanned >= max_files:
            truncated = True
            break
        scanned += 1

        dims = _probe_dimensions(real_full, kind)
        if dims is None:
            unreadable.append(name)
            continue
        bucket = _nearest_bucket(dims, buckets)
        if bucket is None:
            unreadable.append(name)
            continue
        assignments.setdefault(bucket, []).append(name)

    result_buckets = [
        {
            "resolution": [w, h],
            "aspect": round(w / h, 4),
            "count": len(items),
            "items": sorted(items),
        }
        for (w, h), items in sorted(
            assignments.items(),
            key=lambda kv: (-len(kv[1]), kv[0]),
        )
    ]

    return {
        "target_area": target_w * target_h,
        "target_resolution": [target_w, target_h],
        "buckets": result_buckets,
        "unreadable": unreadable,
        "scanned": scanned,
        "truncated": truncated,
    }


# ---------------------------------------------------------------------------
# POST /api/dataset/{index}/upload — upload files to target or reference slot
# ---------------------------------------------------------------------------


@router.post("/{index}/upload")
async def upload_to_dataset(
    index: int,
    request: Request,
    files: list[UploadFile] = File(...),
    slot: str = Form("target"),
    caption_extension: str = Form(".txt"),
):
    """Upload media files to a dataset's target or reference directory."""
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    entry = datasets[index]

    if slot == "target":
        dest_dir = entry.directory
    elif slot == "reference":
        dest_dir = entry.reference_directory
    else:
        raise HTTPException(status_code=422, detail=f"Invalid slot: {slot}")

    if not dest_dir:
        raise HTTPException(status_code=400, detail=f"No {slot} directory configured for this dataset")

    dir_path = Path(dest_dir)
    dir_path.mkdir(parents=True, exist_ok=True)

    uploaded: list[str] = []
    for f in files:
        if not f.filename:
            continue
        target = dir_path / f.filename
        content = await f.read()
        target.write_bytes(content)
        uploaded.append(f.filename)

        # Create blank caption files for target uploads only
        if slot == "target":
            ext = Path(f.filename).suffix.lower()
            if ext in _MEDIA_EXTS:
                caption_path = dir_path / (Path(f.filename).stem + caption_extension)
                if not caption_path.exists():
                    caption_path.write_text("", encoding="utf-8")

    return {"ok": True, "uploaded": uploaded, "count": len(uploaded)}


# ---------------------------------------------------------------------------
# GET /api/dataset/{index}/media/{file_path} — serve media from a dataset
# ---------------------------------------------------------------------------


@router.get("/{index}/media/{file_path:path}")
async def serve_dataset_media(
    index: int,
    file_path: str,
    request: Request,
    slot: str = Query("target"),
):
    """Serve a media file from a dataset's target or reference directory."""
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    entry = datasets[index]

    if slot == "target":
        base_dir = entry.directory
    elif slot == "reference":
        base_dir = entry.reference_directory
    else:
        raise HTTPException(status_code=422, detail=f"Invalid slot: {slot}")

    if not base_dir:
        raise HTTPException(status_code=400, detail=f"No {slot} directory configured")

    real_base = os.path.realpath(base_dir)
    real_full = os.path.realpath(os.path.join(real_base, file_path))

    if not real_full.startswith(real_base + os.sep) and real_full != real_base:
        raise HTTPException(403, "Path traversal outside dataset directory")
    if not os.path.isfile(real_full):
        raise HTTPException(404, "File not found")

    return FileResponse(real_full)


# ---------------------------------------------------------------------------
# GET /api/dataset/{index}/thumb/{file_path} — serve a video thumbnail
# ---------------------------------------------------------------------------

_THUMB_MAX_W = 320
_THUMB_QUALITY = 75


def _extract_video_thumbnail(video_path: str, thumb_path: str) -> bool:
    """Extract frame 0 from a video and save as JPEG. Returns True on success."""
    try:
        import av as _av
        from PIL import Image as _Image

        with _av.open(video_path) as container:
            stream = container.streams.video[0]
            stream.codec_context.thread_type = "AUTO"
            for frame in container.decode(stream):
                img = frame.to_image()
                # Resize to thumbnail width, preserving aspect ratio
                w, h = img.size
                if w > _THUMB_MAX_W:
                    new_h = int(h * _THUMB_MAX_W / w)
                    img = img.resize((_THUMB_MAX_W, new_h), _Image.LANCZOS)
                Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)
                img.save(thumb_path, "JPEG", quality=_THUMB_QUALITY)
                return True
    except Exception:
        return False
    return False


def _resize_image_thumbnail(image_path: str, thumb_path: str) -> bool:
    """Resize an image to thumbnail width and save as JPEG."""
    try:
        from PIL import Image as _Image

        img = _Image.open(image_path)
        img = img.convert("RGB")
        w, h = img.size
        if w > _THUMB_MAX_W:
            new_h = int(h * _THUMB_MAX_W / w)
            img = img.resize((_THUMB_MAX_W, new_h), _Image.LANCZOS)
        Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)
        img.save(thumb_path, "JPEG", quality=_THUMB_QUALITY)
        return True
    except Exception:
        return False


@router.get("/{index}/thumb/{file_path:path}")
async def serve_thumbnail(
    index: int,
    file_path: str,
    request: Request,
    slot: str = Query("target"),
):
    """Serve a thumbnail for a media file. Generates and caches on first request.

    For videos: extracts frame 0 as JPEG.
    For images: resizes to 320px wide JPEG.
    For audio: returns 404 (no visual thumbnail).
    """
    config = _get_config(request)
    datasets = config.dataset.datasets
    if index < 0 or index >= len(datasets):
        raise HTTPException(status_code=404, detail=f"Dataset index {index} out of range")

    entry = datasets[index]

    if slot == "target":
        base_dir = entry.directory
    elif slot == "reference":
        base_dir = entry.reference_directory
    else:
        raise HTTPException(status_code=422, detail=f"Invalid slot: {slot}")

    if not base_dir:
        raise HTTPException(status_code=400, detail=f"No {slot} directory configured")

    real_base = os.path.realpath(base_dir)
    real_full = os.path.realpath(os.path.join(real_base, file_path))

    if not real_full.startswith(real_base + os.sep) and real_full != real_base:
        raise HTTPException(403, "Path traversal outside dataset directory")
    if not os.path.isfile(real_full):
        raise HTTPException(404, "File not found")

    ext = os.path.splitext(file_path)[1].lower()
    if ext in _AUDIO_EXTS:
        raise HTTPException(404, "No thumbnail for audio files")

    # Thumbnail cache: .thumbs/ directory alongside the media
    thumb_dir = os.path.join(real_base, ".thumbs")
    stem = os.path.splitext(os.path.basename(file_path))[0]
    thumb_path = os.path.join(thumb_dir, f"{stem}.jpg")

    # Serve cached thumbnail if it exists and is newer than the source
    if os.path.isfile(thumb_path):
        if os.path.getmtime(thumb_path) >= os.path.getmtime(real_full):
            return FileResponse(thumb_path, media_type="image/jpeg")

    # Generate thumbnail
    if ext in _VIDEO_EXTS:
        ok = _extract_video_thumbnail(real_full, thumb_path)
    elif ext in _IMAGE_EXTS:
        ok = _resize_image_thumbnail(real_full, thumb_path)
    else:
        raise HTTPException(404, "Unsupported file type for thumbnail")

    if not ok:
        raise HTTPException(500, "Failed to generate thumbnail")

    return FileResponse(thumb_path, media_type="image/jpeg")
