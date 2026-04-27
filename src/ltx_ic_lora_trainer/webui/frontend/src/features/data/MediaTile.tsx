import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useSaveCaption } from "@/api/captions";
import type { DatasetAsset } from "@/api/datasets";

interface MediaTileProps {
  asset: DatasetAsset;
  datasetIndex: number;
  /** Absolute path to the target directory. */
  targetDir: string;
  /** Absolute path to the reference directory — caption fallback when no target. */
  referenceDir: string;
  captionExtension: string;
  /** Index in the grid, used for staggered entrance animation. */
  tileIndex?: number;
}

/**
 * A single grid tile showing reference (left) + target (right) media
 * side-by-side, with synced hover playback and an inline caption editor.
 */
export function MediaTile({
  asset,
  datasetIndex,
  targetDir,
  referenceDir,
  captionExtension,
  tileIndex = 0,
}: MediaTileProps) {
  const [captionText, setCaptionText] = useState(asset.caption_text);
  const [dirty, setDirty] = useState(false);
  const [hovering, setHovering] = useState(false);
  const saveMutation = useSaveCaption();

  // Sync from prop when asset changes
  useEffect(() => {
    setCaptionText(asset.caption_text);
    setDirty(false);
  }, [asset.caption_text, asset.filename]);

  // Caption lives alongside the target, or next to the reference if no target
  const captionBase = asset.has_target ? targetDir : referenceDir;
  const stem = asset.filename.replace(/\.[^.]+$/, "");
  const captionPath = `${captionBase}/${stem}${captionExtension}`;

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    try {
      await saveMutation.mutateAsync({ path: captionPath, content: captionText });
      setDirty(false);
    } catch {
      toast.error("Failed to save caption");
    }
  }, [dirty, captionPath, captionText, saveMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const targetMedia = asset.has_target && asset.target_filename
    ? `/api/dataset/${datasetIndex}/media/${encodeURIComponent(asset.target_filename)}?slot=target`
    : null;
  const targetThumb = asset.has_target && asset.target_filename
    ? `/api/dataset/${datasetIndex}/thumb/${encodeURIComponent(asset.target_filename)}?slot=target`
    : null;

  const refMedia = asset.has_reference && asset.reference_filename
    ? `/api/dataset/${datasetIndex}/media/${encodeURIComponent(asset.reference_filename)}?slot=reference`
    : null;
  const refThumb = asset.has_reference && asset.reference_filename
    ? `/api/dataset/${datasetIndex}/thumb/${encodeURIComponent(asset.reference_filename)}?slot=reference`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(tileIndex * 0.03, 0.3), ease: "easeOut" }}
    >
    <Card className="overflow-hidden">
      {/* Media row: reference (left) + target (right) — hover on either triggers both */}
      <div
        className="grid grid-cols-2 gap-px bg-border"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Left: Reference */}
        {refMedia && refThumb ? (
          <MediaPanel
            mediaSrc={refMedia}
            thumbSrc={refThumb}
            type={asset.type}
            label="Reference"
            playing={hovering}
          />
        ) : (
          <div className="flex items-center justify-center bg-muted/30 p-4">
            <span className="text-xs text-muted-foreground">No reference</span>
          </div>
        )}

        {/* Right: Target */}
        {targetMedia && targetThumb ? (
          <MediaPanel
            mediaSrc={targetMedia}
            thumbSrc={targetThumb}
            type={asset.type}
            label="Target"
            playing={hovering}
          />
        ) : (
          <div className="flex items-center justify-center bg-muted/30 p-4">
            <span className="text-xs text-muted-foreground">No target</span>
          </div>
        )}
      </div>

      {/* Caption editor */}
      <div className="relative p-2">
        <Textarea
          value={captionText}
          onChange={(e) => {
            setCaptionText(e.target.value);
            setDirty(true);
          }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder="Enter caption..."
          className="min-h-[60px] resize-none text-xs"
          rows={2}
        />
        {dirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute right-3 top-3 size-2 rounded-full bg-amber-400 cursor-default" />
            </TooltipTrigger>
            <TooltipContent>Unsaved — Ctrl+S to save</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Filename label */}
      <div className="border-t border-border px-2 py-1">
        <span className="truncate text-[11px] text-muted-foreground">{asset.filename}</span>
      </div>
    </Card>
    </motion.div>
  );
}

/**
 * Shows a lightweight JPEG thumbnail by default. When `playing` is true,
 * swaps in the full <video> element with autoplay. Both panels in a tile
 * receive the same `playing` prop so they play/stop in sync.
 */
function MediaPanel({
  mediaSrc,
  thumbSrc,
  type,
  label,
  playing,
}: {
  mediaSrc: string;
  thumbSrc: string;
  type: "video" | "image" | "audio";
  label: string;
  playing: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync play/pause state with the playing prop
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [playing]);

  if (type === "video") {
    return (
      <div className="group relative bg-black">
        {playing ? (
          <video
            ref={videoRef}
            className="aspect-video w-full object-contain"
            preload="auto"
            muted
            loop
          >
            <source src={mediaSrc} />
          </video>
        ) : (
          <img
            src={thumbSrc}
            alt={label}
            className="aspect-video w-full object-contain"
            loading="lazy"
          />
        )}
        <LabelOverlay label={label} />
      </div>
    );
  }

  if (type === "image") {
    return (
      <div className="group relative bg-muted">
        <img
          src={thumbSrc}
          alt={label}
          className="aspect-video w-full object-contain"
          loading="lazy"
        />
        <LabelOverlay label={label} />
      </div>
    );
  }

  // audio
  return (
    <div className="group relative flex items-center justify-center bg-muted p-4">
      <audio controls preload="metadata" className="w-full">
        <source src={mediaSrc} />
      </audio>
      <LabelOverlay label={label} />
    </div>
  );
}

/**
 * Gradient fade at the top of a media panel with the label integrated
 * into it. Replaces the old "floating badge" approach — this reads as
 * part of the image/video rather than stuck on top of it.
 */
function LabelOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-start bg-gradient-to-b from-black/60 via-black/20 to-transparent px-2.5 py-1.5 opacity-80 transition-opacity duration-200 group-hover:opacity-100">
      <span className="text-[10px] font-medium uppercase tracking-wider text-white/90">
        {label}
      </span>
    </div>
  );
}
