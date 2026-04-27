import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface SystemInfo {
  cpu: { model: string; cores: number };
  ram: { total_gb: number; used_gb: number; available_gb: number; percent: number };
  gpus: Array<{
    name: string;
    vram_total_mb: number;
    vram_used_mb: number;
    vram_free_mb: number;
    temperature: number;
    utilization: number;
  }>;
  disk: { total_gb: number; used_gb: number; free_gb: number };
  os: string;
  python: string;
}

/**
 * System info with fallback polling.
 *
 * The WebSocket hub pushes updates to this query key every ~5s when
 * connected. HTTP polling acts as a slow fallback (30s) in case the
 * hub is down or hasn't connected yet.
 */
export function useSystemInfo() {
  return useQuery<SystemInfo>({
    queryKey: ["system", "info"],
    queryFn: () => api.get<SystemInfo>("/api/system/info"),
    refetchInterval: 30_000,
  });
}
