"""Caption browsing and editing endpoints.

Provides asset listing, caption read/write, and media serving for
dataset directories. Designed for the Captions page in the webui.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/captions", tags=["captions"])

# ---------------------------------------------------------------------------
# Extension sets (case-insensitive matching). These mirror the lists in
# dataset/image_video_dataset.py but are kept independent to avoid pulling
# in heavy dataset dependencies.
# ---------------------------------------------------------------------------

VIDEO_EXTS = frozenset({
    ".mp4", ".webm", ".avi", ".mkv", ".mov", ".flv", ".wmv",
    ".m4v", ".mpg", ".mpeg",
})
IMAGE_EXTS = frozenset({
    ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".avif", ".jxl",
})
AUDIO_EXTS = frozenset({
    ".wav", ".flac", ".mp3", ".ogg", ".m4a", ".aac", ".opus", ".wma",
})
ALL_MEDIA_EXTS = VIDEO_EXTS | IMAGE_EXTS | AUDIO_EXTS


def _classify(ext: str) -> str | None:
    """Return 'video', 'image', 'audio', or None."""
    low = ext.lower()
    if low in VIDEO_EXTS:
        return "video"
    if low in IMAGE_EXTS:
        return "image"
    if low in AUDIO_EXTS:
        return "audio"
    return None


# ---------------------------------------------------------------------------
# GET /api/captions/assets — list assets in a dataset directory
# ---------------------------------------------------------------------------


@router.get("/assets")
async def list_assets(
    directory: str = Query(..., description="Dataset directory to scan"),
    caption_extension: str = Query(".txt", description="Extension for caption files"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    """Scan *directory* for media files and report caption status for each."""
    if not os.path.isdir(directory):
        raise HTTPException(404, f"Directory not found: {directory}")

    assets: list[dict] = []
    try:
        entries = sorted(os.listdir(directory))
    except OSError as exc:
        raise HTTPException(500, f"Cannot list directory: {exc}") from exc

    for name in entries:
        ext = os.path.splitext(name)[1]
        asset_type = _classify(ext)
        if asset_type is None:
            continue

        full = os.path.join(directory, name)
        if not os.path.isfile(full):
            continue

        base = os.path.splitext(name)[0]
        caption_path = os.path.join(directory, base + caption_extension)
        try:
            size = os.path.getsize(full)
        except OSError:
            size = 0

        assets.append({
            "filename": name,
            "type": asset_type,
            "size_bytes": size,
            "has_caption": os.path.isfile(caption_path),
        })

    total = len(assets)
    page = assets[offset : offset + limit]
    return {"directory": directory, "total": total, "offset": offset, "assets": page}


# ---------------------------------------------------------------------------
# GET /api/captions/read — read a single caption file
# ---------------------------------------------------------------------------


@router.get("/read")
async def read_caption(
    path: str = Query(..., description="Full path to the caption file"),
):
    """Read caption text. Returns empty string if the file does not exist."""
    if os.path.isfile(path):
        try:
            content = Path(path).read_text(encoding="utf-8")
        except OSError as exc:
            raise HTTPException(500, f"Cannot read file: {exc}") from exc
        return {"content": content}
    return {"content": ""}


# ---------------------------------------------------------------------------
# POST /api/captions/write — write a caption file
# ---------------------------------------------------------------------------


class CaptionWriteBody(BaseModel):
    path: str
    content: str


@router.post("/write")
async def write_caption(body: CaptionWriteBody, request: Request):
    """Write caption text to *path*. Creates parent directories if needed."""
    try:
        p = Path(body.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body.content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(500, f"Cannot write file: {exc}") from exc

    # Push notification through the WebSocket hub if available.
    hub = getattr(request.app.state, "hub_manager", None)
    if hub is not None:
        hub.broadcast("caption_saved", {"path": body.path, "ok": True})

    return {"ok": True}


# ---------------------------------------------------------------------------
# GET /api/captions/media/{file_path} — serve a raw media file
# ---------------------------------------------------------------------------


@router.get("/media/{file_path:path}")
async def serve_media(
    file_path: str,
    base_dir: str = Query(..., description="Dataset directory the file belongs to"),
):
    """Serve a media file from a dataset directory.

    Path-traversal protection: the resolved path must stay within *base_dir*.
    """
    real_base = os.path.realpath(base_dir)
    real_full = os.path.realpath(os.path.join(real_base, file_path))

    if not real_full.startswith(real_base + os.sep) and real_full != real_base:
        raise HTTPException(403, "Path traversal outside dataset directory")
    if not os.path.isfile(real_full):
        raise HTTPException(404, "File not found")

    return FileResponse(real_full)


# ---------------------------------------------------------------------------
# POST /api/captions/upload — upload media files to a dataset directory
# ---------------------------------------------------------------------------


@router.post("/upload")
async def upload_assets(
    directory: str = Form(..., description="Target dataset directory"),
    files: list[UploadFile] = File(...),
    create_captions: bool = Form(True, description="Create blank caption files for media"),
    caption_extension: str = Form(".txt"),
):
    """Upload media files to a dataset directory.

    Optionally creates blank caption files alongside each uploaded media file.
    """
    dir_path = Path(directory)
    dir_path.mkdir(parents=True, exist_ok=True)

    uploaded: list[str] = []
    for f in files:
        if not f.filename:
            continue
        target = dir_path / f.filename
        content = await f.read()
        target.write_bytes(content)
        uploaded.append(f.filename)

        # Create blank caption file for media files.
        ext = Path(f.filename).suffix.lower()
        if create_captions and ext in ALL_MEDIA_EXTS:
            caption_path = dir_path / (Path(f.filename).stem + caption_extension)
            if not caption_path.exists():
                caption_path.write_text("", encoding="utf-8")

    return {"ok": True, "uploaded": uploaded, "count": len(uploaded)}
