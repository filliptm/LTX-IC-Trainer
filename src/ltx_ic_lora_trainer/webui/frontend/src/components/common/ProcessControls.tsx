import { Play, Square, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useProcessStatus,
  useStartProcess,
  useStopProcess,
  type ProcessType,
} from "@/api/processes";
import { toast } from "sonner";

/**
 * Compact Start/Stop/status row used on the Dataset tab's pre-cache
 * cards. The Train tab uses StopEditResumeControls instead, which has
 * a richer state machine including Pause and Resume.
 */
export function ProcessControls({ type }: { type: ProcessType }) {
  const { data: status } = useProcessStatus(type);
  const start = useStartProcess(type);
  const stop = useStopProcess(type);

  const state = status?.state ?? "idle";
  const isRunning = state === "running" || state === "stopping";

  const handleStart = async () => {
    try {
      await start.mutateAsync();
      toast.success(`Started ${type}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    }
  };
  const handleStop = async () => {
    try {
      await stop.mutateAsync();
      toast.success(`Stopping ${type}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Stop failed");
    }
  };

  const variant = stateVariant(state);
  const label = state === "idle" && status?.exit_code != null ? `exit ${status.exit_code}` : state;

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleStart} disabled={isRunning} size="sm">
        <Play className="h-4 w-4" /> Start
      </Button>
      <Button onClick={handleStop} disabled={!isRunning} variant="outline" size="sm">
        <Square className="h-4 w-4" /> Stop
      </Button>
      <Badge variant={variant} className="gap-1">
        <Circle className="h-2 w-2 fill-current" />
        {label}
      </Badge>
    </div>
  );
}

function stateVariant(
  state: string,
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  switch (state) {
    case "running":
      return "success";
    case "stopping":
      return "warning";
    case "error":
      return "destructive";
    case "finished":
      return "secondary";
    default:
      return "outline";
  }
}
