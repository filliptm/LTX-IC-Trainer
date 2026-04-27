import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, RotateCcw, Settings, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useProject } from "@/api/projects";
import { useMetrics, useRunEvents, useRunStatus } from "@/api/metrics";
import { useProcessStatus, useResumeProcess } from "@/api/processes";
import { useSamples } from "@/api/samples";
import { useCheckpoints, type Checkpoint } from "@/api/checkpoints";
import { formatDuration, formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useSetContextPanel } from "@/components/layout/ContextPanelContext";

import { Terminal } from "@/features/train/Terminal";
import { StopEditResumeControls } from "@/features/train/StopEditResumeControls";
import { LossChart, LRChart, ValidationLossChart } from "@/features/train/Charts";
import { HyperparameterPage } from "@/features/project/HyperparameterPage";

export const Route = createFileRoute("/training")({
  component: TrainPage,
});

// Parse step from sample filename: {name}_{NNNNNN}_{index}_{timestamp}_{seed}.ext
const SAMPLE_STEP_RE = /_(\d{6})_\d{2}_/;

function isVideo(path: string) {
  return /\.(mp4|webm|mov|mkv)$/i.test(path);
}
function isImage(path: string) {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(path);
}

interface SampleEntry {
  path: string;
  size: number;
  mtime: number;
}

interface SampleGroup {
  step: number;
  checkpoint: Checkpoint | null;
  samples: SampleEntry[];
}

type TrainView = "config" | "live";

function TrainPage() {
  const { data: project } = useProject();
  const { data: processStatus } = useProcessStatus("training");
  const isRunning = processStatus?.state === "running" || processStatus?.state === "stopping";

  // Default to "live" view when training is actively running, "config" otherwise
  const [view, setView] = useState<TrainView>(isRunning ? "live" : "config");

  // Auto-flip to live when training kicks off
  // (only if user hasn't explicitly chosen the other view recently)
  // For simplicity: if isRunning becomes true, switch to live; if it ends, leave them where they are.

  // Context panel content depends on view
  useSetContextPanel(<RunInfoPanel processState={processStatus?.state} view={view} setView={setView} />);

  if (!project?.loaded) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Load a project on the Data tab to launch training.
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {view === "live" ? (
        <motion.div
          key="live"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
          <LiveTrainingView />
        </motion.div>
      ) : (
        <motion.div
          key="config"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
          <HyperparameterPage />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Live training view — status cards, charts, terminal, checkpoints
// ---------------------------------------------------------------------------

function LiveTrainingView() {
  const { data: metrics } = useMetrics();
  const { data: runStatus } = useRunStatus();
  const { data: eventsData } = useRunEvents();

  const rows = metrics?.rows ?? [];
  const events = eventsData?.events ?? [];

  const eta =
    runStatus?.max_steps && runStatus?.step && runStatus?.speed_steps_per_sec
      ? (runStatus.max_steps - runStatus.step) / runStatus.speed_steps_per_sec
      : undefined;
  const latestValidation = [...events]
    .reverse()
    .find((e) => e.type === "validation" && typeof (e as Record<string, unknown>).loss === "number");
  const latestValLoss = latestValidation
    ? (latestValidation as Record<string, unknown>).loss as number
    : undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Training controls + status cards at top */}
      <div className="shrink-0 space-y-4 border-b border-border p-6 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <StopEditResumeControls type="training" />
        </div>
        <StatusCards runStatus={runStatus} eta={eta} latestValLoss={latestValLoss} />
      </div>

      {/* Two-column body: charts + terminal on the left, samples on the right */}
      <div className="flex min-h-0 flex-1">
        {/* Left column: charts at top (fixed height), terminal fills remaining */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 grid gap-4 p-6 pb-0 pt-4 md:grid-cols-2 xl:grid-cols-3">
            <LossChart rows={rows} />
            <LRChart rows={rows} />
            <ValidationLossChart events={events} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-6 pt-4">
            <Terminal type="training" fillHeight />
          </div>
        </div>

        {/* Right: resizable checkpoints & samples panel */}
        <CheckpointsPanel />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right-side panel wrapper for the live view
// ---------------------------------------------------------------------------

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 900;
const PANEL_DEFAULT_WIDTH = 384;
const PANEL_WIDTH_STORAGE_KEY = "ltx2-checkpoints-panel-width";

function CheckpointsPanel() {
  const queryClient = useQueryClient();
  const { isFetching: samplesFetching } = useSamples();
  const { isFetching: ckptFetching } = useCheckpoints();
  const isFetching = samplesFetching || ckptFetching;

  // Persisted resizable width
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return PANEL_DEFAULT_WIDTH;
    const saved = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : PANEL_DEFAULT_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);

  // Drag-to-resize: capture mouse moves on document and update width
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      // Width is the distance from the right edge of the viewport to the cursor
      const next = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(PANEL_MIN_WIDTH, window.innerWidth - e.clientX),
      );
      setWidth(next);
    };
    const handleUp = () => {
      setIsDragging(false);
      window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width));
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, width]);

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["samples"] });
    void queryClient.invalidateQueries({ queryKey: ["checkpoints"] });
  };

  const resetWidth = () => {
    setWidth(PANEL_DEFAULT_WIDTH);
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(PANEL_DEFAULT_WIDTH));
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-border bg-card/40"
      style={{ width: `${width}px` }}
    >
      {/* Drag handle: full-height hit zone + visible grip pill */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        className={cn(
          "group absolute -left-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize items-center justify-center",
        )}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDoubleClick={resetWidth}
        title="Drag to resize · double-click to reset"
      >
        {/* Track line — only visible on hover/drag */}
        <div
          className={cn(
            "absolute inset-y-0 left-1.5 w-px transition-colors",
            isDragging ? "bg-foreground/40" : "bg-transparent group-hover:bg-foreground/20",
          )}
        />
        {/* Grip pill — always visible */}
        <div
          className={cn(
            "relative flex h-14 w-1.5 flex-col items-center justify-center gap-0.5 rounded-full transition-all",
            isDragging
              ? "bg-foreground/70 scale-110"
              : "bg-border group-hover:bg-foreground/50 group-hover:scale-105",
          )}
        >
          {/* Dot accents on the pill for extra affordance */}
          <span className="h-1 w-1 rounded-full bg-background/80" />
          <span className="h-1 w-1 rounded-full bg-background/80" />
          <span className="h-1 w-1 rounded-full bg-background/80" />
        </div>
      </div>

      <div className="relative flex h-10 shrink-0 items-center justify-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Checkpoints &amp; Samples
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="absolute right-2 h-7 w-7 p-0"
          title="Refresh"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <CheckpointsAndSamples />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Checkpoints & Samples
// ---------------------------------------------------------------------------

function CheckpointsAndSamples() {
  const { data: samplesData } = useSamples();
  const { data: checkpointsData } = useCheckpoints();

  const checkpoints = checkpointsData?.checkpoints ?? [];
  const allSamples = samplesData?.samples ?? [];

  const groups = useMemo(() => {
    const ckptMap = new Map<number, Checkpoint>();
    for (const c of checkpoints) ckptMap.set(c.step, c);

    const stepMap = new Map<number, SampleEntry[]>();
    for (const s of allSamples) {
      const m = SAMPLE_STEP_RE.exec(s.path);
      if (!m) continue;
      const step = parseInt(m[1]!, 10);
      if (!stepMap.has(step)) stepMap.set(step, []);
      stepMap.get(step)!.push(s);
    }

    const result: SampleGroup[] = [];
    const allSteps = new Set([...stepMap.keys(), ...ckptMap.keys()]);
    for (const step of Array.from(allSteps).sort((a, b) => b - a)) {
      result.push({
        step,
        checkpoint: ckptMap.get(step) ?? null,
        samples: stepMap.get(step) ?? [],
      });
    }
    return result;
  }, [allSamples, checkpoints]);

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
        No checkpoints yet. They'll appear here as training progresses.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <CheckpointGroup key={group.step} group={group} />
      ))}
    </div>
  );
}

function CheckpointGroup({ group }: { group: SampleGroup }) {
  const resume = useResumeProcess("training");
  const { checkpoint, samples, step } = group;

  const handleResume = async () => {
    if (!checkpoint?.state_dir) return;
    try {
      await resume.mutateAsync();
      toast.success(`Resuming from step ${step}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Resume failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold tabular-nums">Step {step}</h3>
          {checkpoint && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatBytes(checkpoint.size_bytes)}</span>
              {checkpoint.has_comfy && <Badge variant="outline" className="text-[10px] px-1 py-0">comfy</Badge>}
              {checkpoint.has_state && <Badge variant="success" className="text-[10px] px-1 py-0">resumable</Badge>}
            </div>
          )}
        </div>
        {checkpoint?.has_state && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResume}
            disabled={resume.isPending}
          >
            <RotateCcw className="size-3.5" />
            Resume from here
          </Button>
        )}
      </div>

      {samples.length > 0 ? (
        <div
          className="grid gap-1.5"
          style={{
            // Cap at 3 columns so thumbnails grow to fill available width
            // when the user drags the panel wider. For more than 3 samples,
            // they wrap onto additional rows.
            gridTemplateColumns: `repeat(${Math.min(samples.length, 3)}, minmax(0, 1fr))`,
          }}
        >
          {[...samples]
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((s) => (
              <SampleThumbnail key={s.path} sample={s} />
            ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
          Checkpoint only — no validation samples at this step.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sample thumbnail (used in CheckpointGroup grid)
// ---------------------------------------------------------------------------

function SampleThumbnail({ sample }: { sample: SampleEntry }) {
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = `/api/samples/${encodeURIComponent(sample.path)}`;
  const filename = sample.path.split(/[\\/]/).pop() ?? sample.path;
  const video = isVideo(sample.path);
  const image = isImage(sample.path);

  // Sync video play/pause with hover state
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hovering) {
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [hovering]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-black transition-all hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        title={filename}
      >
        {video ? (
          <video
            ref={videoRef}
            src={src}
            className="h-full w-full object-cover"
            preload="metadata"
            muted
            loop
            playsInline
          />
        ) : image ? (
          <img src={src} alt={filename} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {filename}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="truncate text-[10px] font-medium text-white">
            {filename}
          </div>
        </div>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <div className="max-w-3xl">
          <div className="border-b border-border px-4 py-3">
            <div className="font-mono text-xs break-all text-foreground">{filename}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{formatBytes(sample.size)}</div>
          </div>
          <div className="bg-black p-2">
            {video ? (
              <video controls autoPlay loop className="w-full max-h-[70vh] rounded" src={src} />
            ) : image ? (
              <img src={src} alt={filename} className="w-full max-h-[70vh] rounded object-contain" />
            ) : (
              <a href={src} className="block p-6 text-center text-sm text-foreground underline">download</a>
            )}
          </div>
          <div className="flex justify-end border-t border-border px-4 py-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Context panel content — view switcher + run state
// ---------------------------------------------------------------------------

interface RunStatus {
  step?: number;
  max_steps?: number;
  epoch?: number;
  status?: string;
  elapsed_sec?: number;
  speed_steps_per_sec?: number;
}

function RunInfoPanel({
  processState,
  view,
  setView,
}: {
  processState?: string;
  view: TrainView;
  setView: (v: TrainView) => void;
}) {
  const { data: runStatus } = useRunStatus();
  return (
    <div className="flex flex-col">
      <div className="flex h-10 items-center justify-center border-b border-border px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Run
      </div>

      {/* View switcher */}
      <div className="border-b border-border p-2">
        <div className="flex rounded-md bg-muted/50 p-0.5">
          <button
            onClick={() => setView("config")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
              view === "config"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings className="size-3.5" /> Config
          </button>
          <button
            onClick={() => setView("live")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
              view === "live"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Activity className="size-3.5" /> Live
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">State</span>
          <Badge variant={processState === "running" ? "success" : "outline"}>
            {processState ?? "idle"}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Step</span>
          <span className="tabular-nums font-medium">
            {runStatus?.step ?? "—"} / {runStatus?.max_steps ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Speed</span>
          <span className="tabular-nums">
            {runStatus?.speed_steps_per_sec
              ? `${runStatus.speed_steps_per_sec.toFixed(2)} it/s`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Elapsed</span>
          <span className="tabular-nums">
            {runStatus?.elapsed_sec ? formatDuration(runStatus.elapsed_sec) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status cards (live view)
// ---------------------------------------------------------------------------

function StatusCards({
  runStatus,
  eta,
  latestValLoss,
}: {
  runStatus?: RunStatus;
  eta: number | undefined;
  latestValLoss: number | undefined;
}) {
  const cards: { label: string; value: React.ReactNode }[] = [
    {
      label: "Step",
      value: runStatus
        ? `${runStatus.step ?? 0} / ${runStatus.max_steps ?? "?"}`
        : "—",
    },
    {
      label: "Run state",
      value: <Badge>{runStatus?.status ?? "idle"}</Badge>,
    },
    {
      label: "Elapsed",
      value: runStatus?.elapsed_sec ? formatDuration(runStatus.elapsed_sec) : "—",
    },
    {
      label: "ETA",
      value: eta !== undefined ? formatDuration(eta) : "—",
    },
    {
      label: "Speed",
      value: runStatus?.speed_steps_per_sec
        ? `${runStatus.speed_steps_per_sec.toFixed(2)} it/s`
        : "—",
    },
    {
      label: "Validation loss",
      value: latestValLoss !== undefined ? latestValLoss.toFixed(4) : "—",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
        >
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{c.value}</div>
          </CardContent>
        </Card>
        </motion.div>
      ))}
    </div>
  );
}
