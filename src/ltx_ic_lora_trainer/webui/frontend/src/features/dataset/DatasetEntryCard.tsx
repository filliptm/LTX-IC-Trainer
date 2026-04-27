import { Trash2 } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TextField, NumberField, SelectField } from "@/features/project/FormFields";

interface DatasetEntryCardProps {
  /** RHF path prefix, e.g. "dataset.datasets.0" or "dataset.validation_datasets.2" */
  name: string;
  index: number;
  onRemove: () => void;
}

const DATASET_TYPES = ["video", "image", "audio"] as const;
const FRAME_EXTRACTIONS = ["head", "chunk", "slide", "uniform", "full"] as const;

/**
 * One dataset row in the Dataset tab. Edits nested fields under the
 * passed `name` prefix in the ambient RHF form. The core of the IC-LoRA
 * workflow is the Target directory + Reference directory pair: the
 * model learns to produce the Target given the Reference as
 * conditioning (when ic_lora_strategy == v2v).
 */
export function DatasetEntryCard({ name, index, onRemove }: DatasetEntryCardProps) {
  const { watch } = useFormContext();
  const type = watch(`${name}.type`) as "video" | "image" | "audio" | undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="text-sm font-medium">Dataset #{index + 1}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="remove dataset"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <SelectField name={`${name}.type`} label="Type" options={DATASET_TYPES} />

        <TextField
          name={`${name}.directory`}
          label="Target directory"
          placeholder="/path/to/target/videos_or_images"
          hint="The ground-truth data the model learns to produce."
        />
        <TextField
          name={`${name}.cache_directory`}
          label="Target cache dir"
          placeholder="/path/to/target_cache"
          hint="Where encoded target latents are written by ltx2_cache_latents."
        />

        <TextField
          name={`${name}.reference_directory`}
          label="Reference directory"
          placeholder="/path/to/reference/videos_or_images"
          hint="IC-LoRA conditioning input. Used when ic_lora_strategy = v2v (or auto-detected from a v2v preset). Leave empty for plain text-to-X training."
        />
        <TextField
          name={`${name}.reference_cache_directory`}
          label="Reference cache dir"
          placeholder="/path/to/reference_cache"
          hint="Required whenever Reference directory is set."
        />

        <TextField
          name={`${name}.caption_extension`}
          label="Caption extension"
          placeholder=".txt"
        />

        {type !== "audio" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                name={`${name}.resolution_w`}
                label="Width"
                integer
                min={1}
              />
              <NumberField
                name={`${name}.resolution_h`}
                label="Height"
                integer
                min={1}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name={`${name}.batch_size`}
            label="Batch size"
            integer
            min={1}
          />
          <NumberField
            name={`${name}.num_repeats`}
            label="Num repeats"
            integer
            min={1}
          />
        </div>

        {type === "video" && (
          <>
            <NumberField
              name={`${name}.target_frames`}
              label="Target frames"
              integer
              min={1}
              hint="Frames per clip — usually 8k+1 (e.g. 33, 65, 97)."
            />
            <SelectField
              name={`${name}.frame_extraction`}
              label="Frame extraction"
              options={FRAME_EXTRACTIONS}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                name={`${name}.source_fps`}
                label="Source FPS"
                nullable
                step="0.1"
                min={0}
              />
              <NumberField
                name={`${name}.target_fps`}
                label="Target FPS"
                nullable
                step="0.1"
                min={0}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
