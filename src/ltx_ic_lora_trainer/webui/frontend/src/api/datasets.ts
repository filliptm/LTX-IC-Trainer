import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

// ---------------------------------------------------------------------------
// Cache status (existing)
// ---------------------------------------------------------------------------

export interface DatasetCacheEntry {
  index: number;
  directory: string;
  cache_directory: string;
  total_assets: number;
  latent_cached: number;
  text_cached: number;
  needs_text_cache: boolean;
  needs_latent_cache: boolean;
}

export function useCacheStatus() {
  return useQuery<{ datasets: DatasetCacheEntry[] }>({
    queryKey: ["dataset", "cache-status"],
    queryFn: () => api.get<{ datasets: DatasetCacheEntry[] }>("/api/dataset/cache-status"),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Dataset CRUD
// ---------------------------------------------------------------------------

interface CreateDatasetResponse {
  ok: boolean;
  index: number;
  entry: Record<string, unknown>;
}

export function useCreateDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; type: "video" | "image" | "audio" }) =>
      api.post<CreateDatasetResponse>("/api/dataset/create", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
      qc.invalidateQueries({ queryKey: ["dataset"] });
    },
  });
}

export function useDeleteDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (index: number) => api.delete<{ ok: boolean }>(`/api/dataset/${index}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
      qc.invalidateQueries({ queryKey: ["dataset"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Dataset assets (paired media + captions)
// ---------------------------------------------------------------------------

export interface DatasetAsset {
  filename: string;
  type: "video" | "image" | "audio";
  size_bytes: number;
  has_caption: boolean;
  caption_text: string;
  has_target: boolean;
  target_filename: string | null;
  has_reference: boolean;
  reference_filename: string | null;
}

interface DatasetAssetsResponse {
  total: number;
  assets: DatasetAsset[];
}

export function useDatasetAssets(
  datasetIndex: number | null,
  captionExtension: string = ".txt",
) {
  return useQuery<DatasetAssetsResponse>({
    queryKey: ["dataset", datasetIndex, "assets", captionExtension],
    queryFn: () =>
      api.get<DatasetAssetsResponse>(
        `/api/dataset/${datasetIndex}/assets?caption_extension=${encodeURIComponent(captionExtension)}&limit=500`,
      ),
    enabled: datasetIndex !== null,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Upload to dataset slot
// ---------------------------------------------------------------------------

export function useDatasetUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      index: number;
      files: File[];
      slot: "target" | "reference";
      captionExtension?: string;
    }) => {
      const fd = new FormData();
      fd.append("slot", params.slot);
      fd.append("caption_extension", params.captionExtension ?? ".txt");
      for (const f of params.files) fd.append("files", f);
      return api.postForm<{ ok: boolean; uploaded: string[]; count: number }>(
        `/api/dataset/${params.index}/upload`,
        fd,
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["dataset", vars.index, "assets"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

export function useSetThumbnail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { index: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", params.file);
      return api.postForm<{ ok: boolean; path: string }>(
        `/api/dataset/${params.index}/thumbnail`,
        fd,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}
