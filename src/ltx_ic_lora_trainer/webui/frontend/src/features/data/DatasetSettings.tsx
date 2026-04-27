import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border">
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
            <NumberField
              name="resolution_w"
              label="Width"
              integer
              min={64}
              step={64}
            />
            <NumberField
              name="resolution_h"
              label="Height"
              integer
              min={64}
              step={64}
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
                />
                <SelectField
                  name="frame_extraction"
                  label="Frame extraction"
                  options={["head", "chunk", "slide", "uniform", "full"]}
                />
                <NumberField
                  name="frame_sample"
                  label="Frame sample"
                  integer
                  nullable
                  hint="Optional"
                />
                <NumberField
                  name="max_frames"
                  label="Max frames"
                  integer
                  nullable
                  hint="Optional"
                />
                <NumberField
                  name="frame_stride"
                  label="Frame stride"
                  integer
                  nullable
                  hint="Optional"
                />
                <NumberField
                  name="source_fps"
                  label="Source FPS"
                  nullable
                  hint="Optional"
                />
                <NumberField
                  name="target_fps"
                  label="Target FPS"
                  nullable
                  hint="Optional"
                />
              </>
            )}
          </div>
        </div>
      </FormProvider>
    </div>
  );
}
