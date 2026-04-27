import { Save, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCheckpoints, type Checkpoint } from "@/api/checkpoints";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CheckpointListProps {
  selectedStep: number | null;
  onSelectStep: (step: number) => void;
}

/**
 * Context panel content for the Validation page.
 * Shows checkpoints sorted by step, with size and state-dir badges.
 */
export function CheckpointList({ selectedStep, onSelectStep }: CheckpointListProps) {
  const { data } = useCheckpoints();
  const checkpoints = data?.checkpoints ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Checkpoints{checkpoints.length > 0 ? ` · ${checkpoints.length}` : ""}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-1">
        {checkpoints.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No checkpoints yet.
          </div>
        ) : (
          checkpoints.map((ckpt) => (
            <CheckpointRow
              key={ckpt.step}
              checkpoint={ckpt}
              isSelected={selectedStep === ckpt.step}
              onClick={() => onSelectStep(ckpt.step)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CheckpointRow({
  checkpoint,
  isSelected,
  onClick,
}: {
  checkpoint: Checkpoint;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
        isSelected
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <Save className="size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium tabular-nums">Step {checkpoint.step}</div>
        <div className="text-[10px] text-muted-foreground/70">
          {formatBytes(checkpoint.size_bytes)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {checkpoint.has_state && (
          <span title="Resume state available">
            <RotateCcw className="size-3 text-emerald-400" />
          </span>
        )}
        {checkpoint.has_comfy && (
          <Badge variant="outline" className="text-[8px] px-1 py-0">comfy</Badge>
        )}
      </div>
    </button>
  );
}
