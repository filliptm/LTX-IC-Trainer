import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import { useProject } from "@/api/projects";
import { useDatasetBuckets, type DatasetBucketsTrainerParams } from "@/api/datasets";
import { BucketPreview } from "./BucketPreview";
import { DurationPreview } from "./DurationPreview";

const EMPTY_TRAINER: DatasetBucketsTrainerParams = {};

/**
 * Left context-panel content for the Data page when a project is loaded.
 * Shows dataset-level stats: bucket distribution, duration histogram,
 * sample count estimate, and a dropped-videos warning.
 */
export function DatasetStatsSidebar() {
  const { data: project } = useProject();

  const datasets = (
    (project?.config?.dataset as Record<string, unknown> | undefined)
      ?.datasets as Record<string, unknown>[] | undefined
  ) ?? [];

  const entry = datasets[0] as Record<string, unknown> | undefined;

  const w = Number(entry?.resolution_w) || 0;
  const h = Number(entry?.resolution_h) || 0;

  const trainer = useMemo<DatasetBucketsTrainerParams>(() => ({
    target_frames: (entry?.target_frames as number) || null,
    frame_extraction: (entry?.frame_extraction as string) || null,
    frame_stride: (entry?.frame_stride as number) || null,
    frame_sample: (entry?.frame_sample as number) || null,
    target_fps: (entry?.target_fps as number) || null,
    max_frames: (entry?.max_frames as number) || null,
  }), [entry]);

  if (!entry) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Dataset Stats
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
        <DroppedVideosWarning datasetIndex={0} w={w} h={h} trainer={trainer} />

        <section>
          <BucketPreview datasetIndex={0} width={w} height={h} trainer={trainer} />
        </section>

        <section>
          <DurationPreview datasetIndex={0} width={w} height={h} trainer={trainer} />
        </section>
      </div>
    </div>
  );
}

function DroppedVideosWarning({
  datasetIndex,
  w,
  h,
  trainer,
}: {
  datasetIndex: number;
  w: number;
  h: number;
  trainer: DatasetBucketsTrainerParams;
}) {
  const { data } = useDatasetBuckets(
    datasetIndex,
    w > 0 ? w : null,
    h > 0 ? h : null,
    "target",
    trainer ?? EMPTY_TRAINER,
  );

  if (!data || data.videos_dropped === 0) return null;

  const total = data.video_count;
  const dropped = data.videos_dropped;
  const pct = total > 0 ? Math.round((dropped / total) * 100) : 0;
  const tf = trainer.target_frames;

  return (
    <div className="rounded-md border border-[hsl(var(--status-warning))]/40 bg-[hsl(var(--status-warning))]/8 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[hsl(var(--status-warning))]" />
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-[hsl(var(--status-warning))]">
            {dropped} of {total} video{total !== 1 ? "s" : ""} will be dropped ({pct}%)
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {tf
              ? `Too short for target_frames=${tf}. They produce zero training samples and are silently skipped.`
              : "Too short for the current target_frames setting. They produce zero training samples and are silently skipped."}
          </p>
        </div>
      </div>
    </div>
  );
}
