import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface Checkpoint {
  filename: string;
  step: number;
  size_bytes: number;
  mtime: number;
  has_comfy: boolean;
  has_state: boolean;
  state_dir: string | null;
}

export function useCheckpoints() {
  return useQuery<{ checkpoints: Checkpoint[] }>({
    queryKey: ["checkpoints"],
    queryFn: () => api.get<{ checkpoints: Checkpoint[] }>("/api/samples/checkpoints"),
    refetchInterval: 30_000,
  });
}
