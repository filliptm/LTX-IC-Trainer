import { Save, Copy } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/api/projects";
import { useProcessCommandPreview } from "@/api/processes";

interface TrainingActionRailProps {
  isDirty: boolean;
  isSaving: boolean;
}

/**
 * Persistent right-side rail on the Config view. Holds:
 *   - Save hyperparameter changes
 *   - Run summary (dataset + estimated VRAM/time)
 *   - Compact command preview
 *
 * Training start/stop/resume controls live on the Live view instead —
 * that's the appropriate place to kick off and manage running training,
 * while this rail stays focused on editing and saving config.
 */
export function TrainingActionRail({ isDirty, isSaving }: TrainingActionRailProps) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card/40">
      <div className="flex h-10 shrink-0 items-center justify-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Config
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Save action */}
        <div className="border-b border-border p-4">
          <Button
            type="submit"
            disabled={!isDirty || isSaving}
            variant={isDirty ? "default" : "outline"}
            size="sm"
            className="w-full"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : isDirty ? "Save changes" : "All saved"}
          </Button>
        </div>

        <RunSummary />
        <CompactCommandPreview />
      </div>
    </aside>
  );
}

function RunSummary() {
  const { data: project } = useProject();
  const { watch } = useFormContext();

  const datasets = (project?.config?.dataset as Record<string, unknown> | undefined)?.datasets as
    | Record<string, unknown>[]
    | undefined;
  const dsCount = datasets?.length ?? 0;

  // Watch fields for live updates
  const mode = watch("training.ltx2_mode") || "video";
  const networkDim = Number(watch("training.network_dim")) || 16;
  const batchAccum = Number(watch("training.gradient_accumulation_steps")) || 1;
  const maxSteps = Number(watch("training.max_train_steps")) || 0;
  const height = Number(watch("training.height")) || 512;
  const width = Number(watch("training.width")) || 768;
  const numFrames = Number(watch("training.sample_num_frames")) || 45;
  const gradientCheckpointing = !!watch("training.gradient_checkpointing");

  // Rough heuristics
  const estVramGb = estimateVram({
    width, height, numFrames, networkDim,
    gradientCheckpointing, batchAccum,
  });
  const estTimeMin = estimateTimeMinutes({ maxSteps, batchAccum });

  return (
    <div className="space-y-3 border-b border-border p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Summary
      </div>
      <dl className="space-y-1.5 text-xs">
        <Row label="Datasets" value={`${dsCount}`} />
        <Row label="Mode" value={<Badge variant="outline" className="px-1.5 py-0 text-[10px]">{mode as string}</Badge>} />
        <Row label="Network rank" value={networkDim} />
        <Row label="Effective batch" value={batchAccum} />
        <Row label="Max steps" value={maxSteps.toLocaleString()} />
        <Row
          label="Est. VRAM"
          value={
            <span className={vramColor(estVramGb)}>
              {estVramGb.toFixed(1)} GB
            </span>
          }
        />
        <Row label="Est. time" value={formatMinutes(estTimeMin)} />
      </dl>
    </div>
  );
}

function CompactCommandPreview() {
  const { data, error } = useProcessCommandPreview("training");
  const cmd = data?.command ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success("Command copied");
    } catch {
      toast.error("Clipboard not available");
    }
  };

  return (
    <div className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Command
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={copy}
          disabled={!cmd}
          title="Copy to clipboard"
        >
          <Copy className="size-3" />
        </Button>
      </div>
      {error ? (
        <div className="text-xs text-destructive">{String(error)}</div>
      ) : cmd ? (
        <pre className="max-h-48 overflow-auto scrollbar-thin rounded bg-muted/50 p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap break-all">
          {cmd}
        </pre>
      ) : (
        <div className="text-xs text-muted-foreground">Load a project to preview the command.</div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium">{value}</dd>
    </div>
  );
}

/** Very rough VRAM estimate based on resolution × frames × LoRA size. */
function estimateVram(args: {
  width: number; height: number; numFrames: number; networkDim: number;
  gradientCheckpointing: boolean; batchAccum: number;
}): number {
  const tokens = (args.width * args.height * args.numFrames) / (32 * 32 * 8);
  const baseModel = 8.5; // ~8.5GB for LTX-2 base
  const lora = (args.networkDim / 16) * 0.6;
  const activations = (tokens * 0.000004) * (args.gradientCheckpointing ? 0.4 : 1.0);
  const optimizer = lora * 4; // adamw8bit
  return baseModel + lora + activations + optimizer + 1.5; // overhead
}

/** Rough minutes estimate based on max_steps. */
function estimateTimeMinutes(args: { maxSteps: number; batchAccum: number }): number {
  // very loose: ~2.5s per step on a 4090, ignore batch size scaling
  return (args.maxSteps * 2.5 * args.batchAccum) / 60;
}

function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

function vramColor(gb: number): string {
  if (gb >= 22) return "text-[hsl(var(--status-danger))] font-medium";
  if (gb >= 14) return "text-[hsl(var(--status-warning))]";
  return "text-[hsl(var(--status-success))]";
}
