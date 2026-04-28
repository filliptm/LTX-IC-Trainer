import { useEffect, useState } from "react";

import { useDatasetBuckets, type DatasetBucketsTrainerParams } from "@/api/datasets";
import { Skeleton } from "@/components/ui/skeleton";

interface DurationPreviewProps {
  datasetIndex: number;
  width: number;
  height: number;
  trainer: DatasetBucketsTrainerParams;
}

/**
 * Source-clip duration histogram + trainer-effective sample-count estimate.
 *
 * Shares its data fetch with <BucketPreview> via `useDatasetBuckets`: the
 * single /buckets request reads each video's header once via cv2 and
 * returns dimensions, frame count, and FPS in one shot, so this component
 * gets duration data for free.
 *
 * The "estimated training samples" line at the bottom mirrors the
 * dataloader's chunk/slide/head/uniform/full math against the user's
 * current target_frames + extraction strategy + target_fps so the count
 * updates live as they edit the video options.
 */
export function DurationPreview({ datasetIndex, width, height, trainer }: DurationPreviewProps) {
  // Debounce identical to BucketPreview (300ms) so we don't pile up
  // requests while the user is typing into the resolution / video-options
  // fields. The query key already changes on every input so debouncing
  // here is the only knob preventing request spam.
  const debouncedW = useDebounced(width, 300);
  const debouncedH = useDebounced(height, 300);
  const debouncedTrainer = useDebounced(trainer, 300);

  const { data, isLoading, isError } = useDatasetBuckets(
    datasetIndex,
    debouncedW,
    debouncedH,
    "target",
    debouncedTrainer,
  );

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn't load duration preview.
      </p>
    );
  }

  const dist = data.duration_distribution;

  if (data.video_count === 0 && data.image_count === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No media yet. Upload some clips to see duration stats.
      </p>
    );
  }

  // Image-only datasets: clips have no duration. Surface the sample count
  // anyway since it's still informative (1 image = 1 training sample).
  const hasVideos = data.video_count > 0 && dist.count > 0;
  const maxBin = Math.max(...dist.bins.map((b) => b.count), 1);

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Duration · {data.video_count} video{data.video_count === 1 ? "" : "s"}
        {data.image_count > 0 && (
          <>
            {" "}· {data.image_count} image{data.image_count === 1 ? "" : "s"}
          </>
        )}
      </div>

      {hasVideos ? (
        <>
          {/* Summary line */}
          <div className="text-[11px] text-muted-foreground">
            avg <span className="font-medium text-foreground">{formatSeconds(dist.avg_s)}</span>
            {" "}· median {formatSeconds(dist.p50)}
            {" "}· p95 {formatSeconds(dist.p95)}
            {" "}· total {formatSeconds(dist.total_s)}
          </div>

          {/* Histogram */}
          <div className="space-y-1">
            {dist.bins.map((bin) => (
              <DurationBinRow key={bin.label} bin={bin} maxCount={maxBin} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No videos in this dataset — duration histogram applies to video clips only.
        </p>
      )}

      {/* Trainer-effective sample count — the headline insight. */}
      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          With current settings
        </div>
        <div className="mt-0.5 text-[13px]">
          <span className="font-mono text-base font-semibold tabular-nums text-foreground">
            {data.estimated_training_samples.toLocaleString()}
          </span>
          <span className="text-muted-foreground">
            {" "}training sample{data.estimated_training_samples === 1 ? "" : "s"} per epoch
          </span>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground leading-snug">
          {explainEstimate(trainer, data.video_count, data.image_count)}
        </div>
      </div>
    </div>
  );
}

function DurationBinRow({
  bin,
  maxCount,
}: {
  bin: { label: string; min_s: number; max_s: number | null; count: number };
  maxCount: number;
}) {
  const pct = (bin.count / maxCount) * 100;
  return (
    <div>
      <div className="relative h-1.5 overflow-hidden rounded-sm bg-muted/30">
        <div
          className="absolute inset-y-0 left-0 bg-primary/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{bin.label}</span>
        <span className="tabular-nums font-medium text-foreground">{bin.count}</span>
      </div>
    </div>
  );
}

function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  const min = Math.floor(s / 60);
  const rem = Math.round(s - min * 60);
  return `${min}m ${rem}s`;
}

function explainEstimate(
  trainer: DatasetBucketsTrainerParams,
  videoCount: number,
  imageCount: number,
): string {
  const parts: string[] = [];
  if (videoCount > 0) {
    const tf = trainer.target_frames ?? "?";
    const ext = trainer.frame_extraction ?? "head";
    parts.push(`${videoCount} video${videoCount === 1 ? "" : "s"} via ${ext}, target_frames=${tf}`);
    if (trainer.target_fps && trainer.target_fps > 0) {
      parts.push(`@ ${trainer.target_fps}fps`);
    }
  }
  if (imageCount > 0) {
    parts.push(`${imageCount} image${imageCount === 1 ? "" : "s"} as 1 sample each`);
  }
  return parts.join(" · ") || "No trainable media";
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
