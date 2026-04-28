import { useEffect, useState } from "react";

import { useDatasetBuckets, type DatasetBucketsTrainerParams } from "@/api/datasets";
import { Skeleton } from "@/components/ui/skeleton";

interface DurationPreviewProps {
  datasetIndex: number;
  width: number;
  height: number;
  trainer: DatasetBucketsTrainerParams;
}

export function DurationPreview({ datasetIndex, width, height, trainer }: DurationPreviewProps) {
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
      <div className="space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-[11px] text-muted-foreground">Couldn't load frame stats.</p>;
  }

  if (data.video_count === 0 && data.image_count === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No media yet.
      </p>
    );
  }

  const dist = data.frame_distribution;
  const hasFrameData = dist && dist.count > 0;
  const maxBin = hasFrameData ? Math.max(...dist.bins.map((b) => b.count), 1) : 1;

  return (
    <div className="space-y-3">
      {/* Media count line */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{data.video_count}</span>
        video{data.video_count === 1 ? "" : "s"}
        {data.image_count > 0 && (
          <>
            <span className="text-border">·</span>
            <span className="font-medium text-foreground">{data.image_count}</span>
            image{data.image_count === 1 ? "" : "s"}
          </>
        )}
      </div>

      {hasFrameData ? (
        <>
          {/* Summary stats row */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <StatPill label="avg" value={`${Math.round(dist.avg)}f`} />
            <StatPill label="median" value={`${dist.p50}f`} />
            <StatPill label="p95" value={`${dist.p95}f`} />
            <StatPill label="range" value={`${dist.min}–${dist.max}f`} />
          </div>

          {/* Frame count histogram */}
          <div className="space-y-1.5">
            {dist.bins.map((bin) => (
              <FrameBinRow key={bin.label} bin={bin} maxCount={maxBin} />
            ))}
          </div>
        </>
      ) : data.video_count > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Frame counts unavailable — video headers may be unreadable.
        </p>
      ) : null}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] text-muted-foreground/70">{label}</span>
      <span className="text-[11px] font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function FrameBinRow({
  bin,
  maxCount,
}: {
  bin: { label: string; min_f: number; max_f: number | null; count: number };
  maxCount: number;
}) {
  const pct = (bin.count / maxCount) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-muted-foreground">{bin.label}f</span>
        <span className="tabular-nums font-medium text-foreground">{bin.count}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-sm bg-muted/40">
        <div
          className="absolute inset-y-0 left-0 rounded-sm bg-primary/60"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
