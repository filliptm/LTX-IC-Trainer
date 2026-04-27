import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface SampleEntry {
  path: string;
  size: number;
  mtime: number;
}

export function useSamples() {
  return useQuery<{ samples: SampleEntry[] }>({
    queryKey: ["samples"],
    queryFn: () => api.get<{ samples: SampleEntry[] }>("/api/samples/list"),
    refetchInterval: 10000,
  });
}
