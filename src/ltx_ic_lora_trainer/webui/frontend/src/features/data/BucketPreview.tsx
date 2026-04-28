import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import { useDatasetBuckets, type DatasetBucketsTrainerParams } from "@/api/datasets";
import { Skeleton } from "@/components/ui/skeleton";

interface BucketPreviewProps {
  datasetIndex: number;
  width: number;
  height: number;
  /**
   * Trainer-effective parameters forwarded to /buckets so this component
   * shares its cache key with <DurationPreview>. The bucket result itself
   * doesn't depend on these values, but the response also carries the
   * sample-count estimate — sharing the key is what dedupes the two
   * components into a single network request.
   */
  trainer?: DatasetBucketsTrainerParams;
}

/**
 * Live histogram of bucket assignments for a dataset.
 *
 * Given the user's current target (W, H), walks the dataset's media files
 * server-side and reports which LTX-2 aspect-ratio bucket each file lands
 * in. Each row shows the bucket resolution, a friendly aspect label
 * (e.g. "9:16 portrait"), and a count. Updates 300ms after the user stops
 * typing into the resolution fields.
 *
 * The trainer's actual bucketing is handled by BucketSelector; this is a
 * preview, not the source of truth — it ignores the no-upscale clamp at
 * image_video_dataset.py:458-462, which only fires for clips smaller than
 * the target. For an overview histogram that's an acceptable approximation.
 */
const EMPTY_TRAINER: DatasetBucketsTrainerParams = {};

export function BucketPreview({ datasetIndex, width, height, trainer }: BucketPreviewProps) {
  // Debounce input dimensions by 300ms so we don't spam the backend while
  // the user is still typing into the resolution fields.
  const debouncedW = useDebounced(width, 300);
  const debouncedH = useDebounced(height, 300);
  // Stable empty fallback so an undefined `trainer` doesn't churn the
  // debouncer with a fresh object reference on every render.
  const debouncedTrainer = useDebounced(trainer ?? EMPTY_TRAINER, 300);

  const { data, isLoading, isError } = useDatasetBuckets(
    datasetIndex,
    debouncedW,
    debouncedH,
    "target",
    debouncedTrainer,
  );

  const [showUnreadable, setShowUnreadable] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn't load bucket preview.
      </p>
    );
  }

  if (data.buckets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No buckets — drop media into this dataset to see assignments.
      </p>
    );
  }

  const maxCount = Math.max(...data.buckets.map((b) => b.count), 1);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">
        {data.scanned} file{data.scanned === 1 ? "" : "s"} scanned
      </p>
      <div className="space-y-1.5">
        {data.buckets.map((b) => (
          <BucketRow key={`${b.resolution[0]}x${b.resolution[1]}`} bucket={b} maxCount={maxCount} />
        ))}
      </div>

      {data.truncated && (
        <p className="text-[10px] text-muted-foreground">
          Showing first {data.scanned} files (capped at 2000).
        </p>
      )}

      {data.unreadable.length > 0 && (
        <div className="rounded border border-border/60 bg-muted/30 p-2">
          <button
            type="button"
            onClick={() => setShowUnreadable((v) => !v)}
            className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showUnreadable ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <AlertTriangle className="size-3 text-[hsl(var(--status-warning))]" />
            <span>
              {data.unreadable.length} file{data.unreadable.length === 1 ? "" : "s"} couldn't be read — corrupt or unsupported
            </span>
          </button>
          {showUnreadable && (
            <ul className="mt-1.5 max-h-32 overflow-y-auto pl-5 text-[10px] text-muted-foreground scrollbar-thin">
              {data.unreadable.map((name) => (
                <li key={name} className="truncate font-mono">{name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BucketRow({
  bucket,
  maxCount,
}: {
  bucket: { resolution: [number, number]; aspect: number; count: number; items: string[] };
  maxCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [w, h] = bucket.resolution;
  const pct = (bucket.count / maxCount) * 100;
  const aspectLabel = formatAspect(w, h);

  return (
    <div>
      {/* Label row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-[10px] mb-0.5 hover:text-foreground"
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )}
          <span className="font-mono text-foreground">{w}×{h}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground/80">{aspectLabel}</span>
        </span>
        <span className="tabular-nums font-medium text-foreground">{bucket.count}</span>
      </button>
      {/* Bar track */}
      <div className="relative h-2 overflow-hidden rounded-sm bg-muted/40">
        <div
          className="absolute inset-y-0 left-0 rounded-sm bg-primary/60"
          style={{ width: `${pct}%` }}
        />
      </div>
      {expanded && (
        <ul className="mt-1 max-h-32 overflow-y-auto pl-5 text-[10px] text-muted-foreground scrollbar-thin">
          {bucket.items.map((name) => (
            <li key={name} className="truncate font-mono">{name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function formatAspect(w: number, h: number): string {
  if (w <= 0 || h <= 0) return "—";
  const ratio = w / h;
  // Within 2% of square → call it square so 960×960 doesn't render as "1:1"
  // when you'd just rather see "square".
  if (Math.abs(ratio - 1) < 0.02) return "square";
  const orientation = w > h ? "landscape" : "portrait";
  const divisor = gcd(w, h);
  const rw = w / divisor;
  const rh = h / divisor;
  // Reduced ratios can be ugly when divisor is 1 (e.g. 1280:719). Fall back
  // to rounding to one decimal of the aspect, formatted as N:1.
  if (rw > 32 || rh > 32) {
    return `${ratio.toFixed(2)}:1 ${orientation}`;
  }
  return `${rw}:${rh} ${orientation}`;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
