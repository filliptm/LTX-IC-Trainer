import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject, useUpdateProject } from "@/api/projects";
import {
  TextField,
  NumberField,
  SelectField,
} from "@/features/project/FormFields";

interface DatasetSettingsProps {
  datasetIndex: number;
}

interface DatasetFormValues {
  type: "video" | "image" | "audio";
  resolution_w: number;
  resolution_h: number;
  batch_size: number;
  num_repeats: number;
  caption_extension: string;
  target_frames: number;
  frame_extraction: "head" | "chunk" | "slide" | "uniform" | "full";
  frame_sample: number | null;
  max_frames: number | null;
  frame_stride: number | null;
  source_fps: number | null;
  target_fps: number | null;
}

/**
 * Right-side panel showing dataset-level settings.
 * Uses its own FormProvider scoped to the selected dataset entry.
 */
export function DatasetSettings({ datasetIndex }: DatasetSettingsProps) {
  const { data: project } = useProject();
  const updateProject = useUpdateProject();

  const datasets = (
    (project?.config?.dataset as Record<string, unknown> | undefined)?.datasets as
      | Record<string, unknown>[]
      | undefined
  ) ?? [];
  const entry = datasets[datasetIndex] as DatasetFormValues | undefined;

  const methods = useForm<DatasetFormValues>({
    defaultValues: entry ?? {},
    mode: "onChange",
  });

  // Reset form when dataset selection changes
  useEffect(() => {
    if (entry) methods.reset(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetIndex, entry?.type]);

  const isDirty = methods.formState.isDirty;
  const watchType = methods.watch("type");
  const isVideo = watchType === "video";

  const handleSave = methods.handleSubmit(async (data) => {
    if (!project?.config) return;

    // Merge the form values back into the full project config
    const config = structuredClone(project.config) as Record<string, unknown>;
    const dsConfig = config.dataset as Record<string, unknown>;
    const dsList = dsConfig.datasets as Record<string, unknown>[];
    dsList[datasetIndex] = { ...dsList[datasetIndex], ...data };

    try {
      await updateProject.mutateAsync(config);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  });

  if (!entry) return null;

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border">
      <div className="relative flex h-10 shrink-0 items-center justify-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Settings
        </span>
        <Button
          size="sm"
          className="absolute right-2 h-7 text-xs"
          onClick={handleSave}
          disabled={!isDirty || updateProject.isPending}
        >
          <Save className="size-3" />
          {updateProject.isPending ? "Saving..." : isDirty ? "Save" : "Saved"}
        </Button>
      </div>

      <FormProvider {...methods}>
        <div className="flex-1 overflow-y-auto p-4 pt-6 scrollbar-thin">
          <div className="space-y-3">
            <SelectField
              name="type"
              label="Type"
              options={["video", "image", "audio"]}
            />
            <div className="-mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                Aspect-aware bucketing on
              </Badge>
            </div>
            <NumberField
              name="resolution_w"
              label="Target width"
              integer
              min={64}
              step={64}
              tooltip={
                <>
                  Target <em>area</em> width — not a hard canvas size. The
                  trainer auto-buckets every clip to the nearest aspect ratio
                  that shares this <strong>W × H</strong> area, snapped to a
                  32-pixel grid.
                  <br /><br />
                  Both portrait and landscape orientations are generated
                  automatically, so a <em>1024 × 576</em> target accepts 9:16
                  vertical inputs without distortion.
                  <br /><br />
                  Multiple of 64 recommended.
                </>
              }
            />
            <NumberField
              name="resolution_h"
              label="Target height"
              integer
              min={64}
              step={64}
              tooltip={
                <>
                  Target <em>area</em> height — not a hard canvas size. The
                  trainer auto-buckets every clip to the nearest aspect ratio
                  that shares this <strong>W × H</strong> area, snapped to a
                  32-pixel grid.
                  <br /><br />
                  Both portrait and landscape orientations are generated
                  automatically, so a <em>1024 × 576</em> target accepts 9:16
                  vertical inputs without distortion.
                  <br /><br />
                  Multiple of 64 recommended.
                </>
              }
            />
            <NumberField
              name="batch_size"
              label="Batch size"
              integer
              min={1}
            />
            <NumberField
              name="num_repeats"
              label="Repeats"
              integer
              min={1}
            />
            <TextField
              name="caption_extension"
              label="Caption ext"
              placeholder=".txt"
            />

            {isVideo && (
              <>
                <div className="mt-4 border-t border-border pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Video options
                  </span>
                </div>
                <NumberField
                  name="target_frames"
                  label="Target frames"
                  integer
                  min={1}
                  tooltip={
                    <>
                      The fixed length (in frames) of every training clip the
                      model sees. Each video on disk is sliced down to exactly
                      this many frames before going into the trainer.
                      <br /><br />
                      <strong>33</strong> is a common choice — it maps cleanly
                      to LTX-2's VAE temporal stride (no padding waste).
                      Larger values cost more VRAM and time per step.
                    </>
                  }
                />
                <SelectField
                  name="frame_extraction"
                  label="Frame extraction"
                  options={["head", "chunk", "slide", "uniform", "full"]}
                  tooltip={
                    <>
                      How the loader picks <em>target_frames</em> out of a
                      longer source clip:
                      <br /><br />
                      <strong>head</strong> · always take the first N frames.
                      Deterministic, fast, but trains only on the opening of
                      each video.
                      <br />
                      <strong>chunk</strong> · split into non-overlapping
                      N-frame blocks; each block becomes its own training
                      item. Multiplies effective dataset size.
                      <br />
                      <strong>slide</strong> · sliding window with optional
                      <em> frame_stride</em>. Like chunk but overlapping —
                      even more samples, more redundancy.
                      <br />
                      <strong>uniform</strong> · pick N frames evenly spaced
                      across the whole clip. Good for slow motion / panning.
                      <br />
                      <strong>full</strong> · use every frame. Only valid when
                      source clips already have exactly target_frames.
                    </>
                  }
                />
                <NumberField
                  name="frame_sample"
                  label="Frame sample"
                  integer
                  nullable
                  hint="Optional"
                  tooltip={
                    <>
                      With <strong>chunk</strong> or <strong>slide</strong>,
                      caps how many extracted samples are kept per source
                      video. If a video would yield 12 chunks but you set
                      <em> frame_sample = 3</em>, you keep 3 random ones.
                      Useful to stop one long video from dominating the
                      training distribution.
                    </>
                  }
                />
                <NumberField
                  name="max_frames"
                  label="Max frames"
                  integer
                  nullable
                  hint="Optional"
                  tooltip={
                    <>
                      Hard ceiling on how many raw source frames are read
                      from each video before extraction runs. With
                      <em> head + max_frames=300</em> you sample from only
                      the first 300 source frames; with <em>chunk</em> you
                      only chunk the first 300. Useful for "ignore everything
                      past minute 1" without re-encoding the file.
                    </>
                  }
                />
                <NumberField
                  name="frame_stride"
                  label="Frame stride"
                  integer
                  nullable
                  hint="Optional"
                  tooltip={
                    <>
                      Step size between consecutive sliding windows when
                      <em> frame_extraction = slide</em>. Smaller stride =
                      more overlap = more samples per source video.
                      <br /><br />
                      Example: <em>target_frames=33, frame_stride=8</em>{" "}
                      starts windows at frames 0, 8, 16, 24, … (each window
                      shares 25 frames with the previous one).
                    </>
                  }
                />
                <NumberField
                  name="source_fps"
                  label="Source FPS"
                  nullable
                  hint="Optional"
                  tooltip={
                    <>
                      Override the source video's FPS. Normally the loader
                      reads this from file metadata — only set this if your
                      videos have wrong/corrupt headers (common with
                      transcoded files). Pairs with <em>target_fps</em> to do
                      temporal resampling.
                    </>
                  }
                />
                <NumberField
                  name="target_fps"
                  label="Target FPS"
                  nullable
                  hint="Optional"
                  tooltip={
                    <>
                      Resample each clip to this FPS before extracting
                      frames. If your sources are 60 fps but the model should
                      learn at 24 fps, set <em>target_fps = 24</em> — the
                      loader drops frames until the effective rate matches.
                      <br /><br />
                      LTX-2's native pacing assumes ~24-25 fps, so 24 is the
                      standard choice for video training.
                    </>
                  }
                />
              </>
            )}
          </div>
        </div>
      </FormProvider>
    </div>
  );
}
