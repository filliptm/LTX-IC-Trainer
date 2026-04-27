import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface MetricRow {
  step: number;
  epoch: number;
  loss: number;
  avr_loss: number;
  loss_v: number | null;
  loss_a: number | null;
  lr: number;
  step_time: number;
}

export interface RunStatus {
  step?: number;
  max_steps?: number;
  epoch?: number;
  max_epochs?: number;
  status?: string;
  elapsed_sec?: number;
  speed_steps_per_sec?: number;
  time?: number;
}

export interface RunEvent {
  type: string;
  step: number;
  time: number;
  [extra: string]: unknown;
}

/**
 * Metrics rows with fallback polling.
 *
 * The WebSocket hub pushes individual metric rows to this query key
 * every ~1s when connected. HTTP polling acts as a slow fallback (30s).
 */
export function useMetrics(sinceStep = 0) {
  return useQuery<{ rows: MetricRow[] }>({
    queryKey: ["metrics", "rows", sinceStep],
    queryFn: () =>
      api.get<{ rows: MetricRow[] }>(`/api/runs/current/metrics?since_step=${sinceStep}`),
    refetchInterval: 30_000,
  });
}

export function useRunStatus() {
  return useQuery<RunStatus | undefined>({
    queryKey: ["metrics", "status"],
    queryFn: () => api.get<RunStatus>("/api/runs/current/status"),
    refetchInterval: 10_000,
  });
}

export function useRunEvents() {
  return useQuery<{ events: RunEvent[] }>({
    queryKey: ["metrics", "events"],
    queryFn: () => api.get<{ events: RunEvent[] }>("/api/runs/current/events"),
    refetchInterval: 15_000,
  });
}
