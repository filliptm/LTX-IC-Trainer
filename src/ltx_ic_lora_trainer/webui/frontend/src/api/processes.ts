import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export type ProcessType =
  | "cache_latents"
  | "cache_text"
  | "cache_dino"
  | "training"
  | "inference"
  | "slider_training"
  | "merge_lora";

/** Matches the backend ProcessState enum in process_manager.py. */
export type ProcessStateValue = "idle" | "running" | "stopping" | "finished" | "error";

export interface ProcessStatus {
  state: ProcessStateValue;
  exit_code: number | null;
  /** Populated by POST /api/processes/{type}/pause — the latest saved state dir for Resume. */
  resume_state_dir: string | null;
}

/**
 * Process status with fallback polling.
 *
 * The WebSocket hub pushes updates to this query key every ~2s when
 * connected. HTTP polling acts as a slow fallback (15s).
 */
export function useProcessStatus(type: ProcessType) {
  return useQuery<ProcessStatus>({
    queryKey: ["processes", type, "status"],
    queryFn: () => api.get<ProcessStatus>(`/api/processes/${type}/status`),
    refetchInterval: 15_000,
  });
}

export function useProcessCommandPreview(type: ProcessType) {
  return useQuery<{ command: string }>({
    queryKey: ["processes", type, "command-preview"],
    queryFn: () => api.get<{ command: string }>(`/api/processes/${type}/command-preview`),
  });
}

export function useStartProcess(type: ProcessType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; state: string }>(`/api/processes/${type}/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", type] }),
  });
}

export function useStopProcess(type: ProcessType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>(`/api/processes/${type}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", type] }),
  });
}

/**
 * Graceful stop that ALSO records the most recent saved training state
 * directory so the matching Resume call can relaunch from there.
 * Returns `{ok, resume_state_dir}` — the resume state dir is null if
 * the training script didn't leave a state dir behind.
 */
export function usePauseProcess(type: ProcessType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; resume_state_dir: string | null }>(
        `/api/processes/${type}/pause`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", type] }),
  });
}

/**
 * Relaunch a training process with --resume <stashed_state_dir> appended.
 * Errors with 400 if no state dir is stashed and none can be found in
 * training.output_dir.
 */
export function useResumeProcess(type: ProcessType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; state: string; resumed_from: string }>(
        `/api/processes/${type}/resume`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", type] }),
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface PipelineStartResult {
  ok: boolean;
  steps: string[];
  skipped_text_cache: boolean;
  skipped_latent_cache: boolean;
}

export interface PipelineStatus {
  active: boolean;
  current_step?: number;
  current_type?: string;
  total_steps?: number;
  step_names?: string[];
}

export function useStartPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PipelineStartResult>("/api/processes/pipeline/start"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["processes"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function usePipelineStatus() {
  return useQuery<PipelineStatus>({
    queryKey: ["pipeline", "status"],
    queryFn: () => api.get<PipelineStatus>("/api/processes/pipeline/status"),
    refetchInterval: 2_000,
  });
}

export function useCancelPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/api/processes/pipeline/cancel"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });
}
