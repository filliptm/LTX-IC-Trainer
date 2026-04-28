import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import { useProject } from "@/api/projects";
import { useDatasetBuckets, type DatasetBucketsTrainerParams } from "@/api/datasets";
import { BucketPreview } from "./BucketPreview";
import { DurationPreview } from "./DurationPreview";

const EMPTY_TRAINER: DatasetBucketsTrainerParams = {};

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
      {/* Panel header */}
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Dataset Stats
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Training samples — headline stat */}
        <TrainingSamplesCard datasetIndex={0} w={w} h={h} trainer={trainer} />

        {/* Dropped videos warning — only shown when non-zero */}
        <DroppedVideosWarning datasetIndex={0} w={w} h={h} trainer={trainer} />

        {/* Divider + section */}
        <SectionBlock label="Aspect Buckets">
          <BucketPreview datasetIndex={0} width={w} height={h} trainer={trainer} />
        </SectionBlock>

        <SectionBlock label="Frame Distribution">
          <DurationPreview datasetIndex={0} width={w} height={h} trainer={trainer} />
        </SectionBlock>
      </div>
    </div>
  );
}

function SectionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="px-4 pb-4">
        {children}
      </div>
    </div>
  );
}

function TrainingSamplesCard({
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

  const samples = data?.estimated_training_samples;

  return (
    <div className="px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Training Samples / Epoch
      </p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
          {samples != null ? samples.toLocaleString() : "—"}
        </span>
        <span className="text-xs text-muted-foreground">samples</span>
      </div>
      {data && (
        <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
          {describeEstimate(trainer, data.video_count, data.image_count)}
        </p>
      )}
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
    <div className="mx-4 mb-1 rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
        <div>
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            {dropped} of {total} video{total !== 1 ? "s" : ""} dropped ({pct}%)
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            {tf
              ? `Shorter than target_frames=${tf} — silently skipped.`
              : "Too short for current target_frames — silently skipped."}
          </p>
        </div>
      </div>
    </div>
  );
}

function describeEstimate(
  trainer: DatasetBucketsTrainerParams,
  videoCount: number,
  imageCount: number,
): string {
  const parts: string[] = [];
  if (videoCount > 0) {
    const tf = trainer.target_frames ?? "?";
    const ext = trainer.frame_extraction ?? "head";
    parts.push(`${videoCount} video${videoCount === 1 ? "" : "s"} · ${ext}, ${tf}f`);
  }
  if (imageCount > 0) {
    parts.push(`${imageCount} image${imageCount === 1 ? "" : "s"}`);
  }
  return parts.join(" + ") || "No trainable media";
}
