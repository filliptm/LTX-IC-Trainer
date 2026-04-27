"""Preprocess Beeble dataset for IC-LoRA v2v training.

For each scene, prepends the Ref image as frame 0 of the Source video
to create a combined reference video. The SwitchX video is copied as
the training target.

Layout produced:
    datasets/beeble/references/{stem}.mp4   (Ref0 frame + Source video)
    datasets/beeble/videos/{stem}.mp4       (SwitchX target)
"""

import argparse
import os
import re
import shutil
from collections import defaultdict
from pathlib import Path

import av
import numpy as np
from PIL import Image


def discover_scenes(src_dir: str) -> dict[str, dict[str, str]]:
    """Group files by scene stem, handling Ref/Ref0 and (N) variants."""
    files = os.listdir(src_dir)
    scenes: dict[str, dict[str, str]] = defaultdict(dict)

    for fname in files:
        full = os.path.join(src_dir, fname)
        if not os.path.isfile(full):
            continue

        # Match: {stem}_{Type}.ext  or  {stem}_{Type} (N).ext  or  {stem} (N)_{Type}.ext
        # Types: Source, SwitchX, Alpha, Ref, Ref0
        m = re.match(r"^(.+?)_(Source|SwitchX|Alpha|Ref0|Ref)(?:\s*\(\d+\))?\.(mp4|png|jpg)$", fname, re.IGNORECASE)
        if not m:
            # Try: {stem} (N)_{Type}.ext
            m = re.match(r"^(.+?\s*\(\d+\))_(Source|SwitchX|Alpha|Ref0|Ref)\.(mp4|png|jpg)$", fname, re.IGNORECASE)
        if not m:
            continue

        stem = m.group(1).strip()
        ftype = m.group(2)
        # Normalize Ref0 -> Ref
        if ftype == "Ref0":
            ftype = "Ref"
        scenes[stem][ftype] = full

    return dict(scenes)


def make_reference_video(ref_image_path: str, source_video_path: str, output_path: str):
    """Prepend ref image as frame 0 to source video, encoding to h264."""
    # Read source video properties
    src_container = av.open(source_video_path)
    src_stream = src_container.streams.video[0]
    width = src_stream.width
    height = src_stream.height
    fps = src_stream.average_rate
    src_container.close()

    # Load and resize ref image to match video dimensions
    ref_img = Image.open(ref_image_path).convert("RGB").resize((width, height), Image.LANCZOS)
    ref_arr = np.array(ref_img)

    # Write output: ref frame + all source frames
    out_container = av.open(output_path, mode="w")
    out_stream = out_container.add_stream("h264", rate=fps)
    out_stream.width = width
    out_stream.height = height
    out_stream.pix_fmt = "yuv420p"
    out_stream.options = {"crf": "18", "preset": "fast"}

    # Write ref image as frame 0
    frame = av.VideoFrame.from_ndarray(ref_arr, format="rgb24")
    for packet in out_stream.encode(frame):
        out_container.mux(packet)

    # Write all source frames
    src_container = av.open(source_video_path)
    for frame in src_container.decode(video=0):
        # Re-encode through our output stream
        out_frame = av.VideoFrame.from_ndarray(frame.to_ndarray(format="rgb24"), format="rgb24")
        for packet in out_stream.encode(out_frame):
            out_container.mux(packet)
    src_container.close()

    # Flush
    for packet in out_stream.encode():
        out_container.mux(packet)
    out_container.close()


def main():
    parser = argparse.ArgumentParser(description="Preprocess Beeble dataset for v2v IC-LoRA training")
    parser.add_argument("--src", required=True, help="Source directory with Beeble data")
    parser.add_argument("--dst", required=True, help="Destination dataset root (will create references/ and videos/ subdirs)")
    parser.add_argument("--skip_existing", action="store_true", help="Skip scenes that already have output files")
    args = parser.parse_args()

    ref_dir = os.path.join(args.dst, "references")
    vid_dir = os.path.join(args.dst, "videos")
    os.makedirs(ref_dir, exist_ok=True)
    os.makedirs(vid_dir, exist_ok=True)

    scenes = discover_scenes(args.src)
    print(f"Found {len(scenes)} scenes")

    complete = 0
    skipped = 0
    errors = 0

    for stem, files in sorted(scenes.items()):
        # Need at minimum: Ref, Source, SwitchX
        missing = [k for k in ("Ref", "Source", "SwitchX") if k not in files]
        if missing:
            print(f"  SKIP {stem}: missing {', '.join(missing)}")
            skipped += 1
            continue

        # Clean stem for output filename (remove problematic chars)
        clean_stem = re.sub(r"[^\w\-]", "_", stem)
        ref_out = os.path.join(ref_dir, f"{clean_stem}.mp4")
        vid_out = os.path.join(vid_dir, f"{clean_stem}.mp4")

        if args.skip_existing and os.path.exists(ref_out) and os.path.exists(vid_out):
            skipped += 1
            continue

        try:
            # Build reference: Ref image prepended to Source video
            print(f"  [{complete + 1}/{len(scenes)}] {stem}")
            make_reference_video(files["Ref"], files["Source"], ref_out)

            # Copy SwitchX as target video
            shutil.copy2(files["SwitchX"], vid_out)

            complete += 1
        except Exception as e:
            print(f"  ERROR {stem}: {e}")
            errors += 1

    print(f"\nDone: {complete} processed, {skipped} skipped, {errors} errors")
    print(f"References: {ref_dir}")
    print(f"Videos:     {vid_dir}")


if __name__ == "__main__":
    main()
