import { Play, Square, RotateCcw, Loader2, Circle, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useProcessStatus,
  useStartProcess,
  usePauseProcess,
  useResumeProcess,
  useStartPipeline,
  usePipelineStatus,
  useCancelPipeline,
  type ProcessType,
} from "@/api/processes";
import { useCacheStatus } from "@/api/datasets";

export function StopEditResumeControls({ type }: { type: ProcessType }) {
  const { data: status } = useProcessStatus(type);
  const { data: cacheStatus } = useCacheStatus();
  const { data: pipelineStatus } = usePipelineStatus();
  const start = useStartProcess(type);
  const pause = usePauseProcess(type);
  const resume = useResumeProcess(type);
  const startPipeline = useStartPipeline();
  const cancelPipeline = useCancelPipeline();

  const state = status?.state ?? "idle";
  const hasResume = !!status?.resume_state_dir;
  const isRunning = state === "running";
  const isStopping = state === "stopping";
  const isPipelineActive = pipelineStatus?.active ?? false;

  // Check if any caches are incomplete.
  const needsCaching = cacheStatus?.datasets?.some(
    (ds) => ds.needs_text_cache || ds.needs_latent_cache
  ) ?? false;

  const handleStart = async () => {
    try {
      if (needsCaching && type === "training") {
        const res = await startPipeline.mutateAsync();
        const steps = res.steps.join(" → ");
        toast.success(`Pipeline started: ${steps}`);
      } else {
        await start.mutateAsync();
        toast.success("Training started");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    }
  };

  const handleStop = async () => {
    try {
      if (isPipelineActive) {
        await cancelPipeline.mutateAsync();
        toast.success("Pipeline cancelled");
        return;
      }
      const res = await pause.mutateAsync();
      if (res.resume_state_dir) {
        toast.success("Stopped — saved state at " + res.resume_state_dir);
      } else {
        toast.warning("Stopped, but no saved state dir was found.");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Stop failed");
    }
  };

  const handleResume = async () => {
    try {
      const res = await resume.mutateAsync();
      toast.success(`Resumed from ${res.resumed_from}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Resume failed");
    }
  };

  const startLabel = needsCaching && type === "training" ? "Start (with caching)" : "Start";
  const anyBusy = isRunning || isStopping || isPipelineActive;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={handleStart} disabled={anyBusy} size="sm">
        {needsCaching && type === "training" ? (
          <Zap className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {isStopping ? "Stopping..." : startLabel}
      </Button>
      <Button
        onClick={handleStop}
        disabled={!isRunning && !isPipelineActive}
        variant="outline"
        size="sm"
      >
        {isStopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
        Stop
      </Button>
      <Button
        onClick={handleResume}
        disabled={anyBusy || !hasResume}
        variant="secondary"
        size="sm"
      >
        <RotateCcw className="h-4 w-4" /> Resume
      </Button>
      <StateBadge state={state} exitCode={status?.exit_code ?? null} isPipeline={isPipelineActive} />
      {isPipelineActive && pipelineStatus && (
        <span className="text-xs text-muted-foreground">
          Pipeline: {pipelineStatus.current_type} ({(pipelineStatus.current_step ?? 0) + 1}/{pipelineStatus.total_steps})
        </span>
      )}
      {hasResume && !anyBusy && (
        <span className="text-xs text-muted-foreground">
          saved state available
        </span>
      )}
    </div>
  );
}

function StateBadge({
  state,
  exitCode,
  isPipeline,
}: {
  state: string;
  exitCode: number | null;
  isPipeline: boolean;
}) {
  const variant = ({
    running: "success",
    stopping: "warning",
    error: "destructive",
    finished: "secondary",
    idle: "outline",
  } as const)[state as "running" | "stopping" | "error" | "finished" | "idle"] ?? "outline";

  let label = state === "idle" && exitCode != null ? `exit ${exitCode}` : state;
  if (isPipeline && state === "running") label = "pipeline";

  return (
    <Badge variant={variant} className="gap-1">
      <Circle className="h-2 w-2 fill-current" />
      {label}
    </Badge>
  );
}
