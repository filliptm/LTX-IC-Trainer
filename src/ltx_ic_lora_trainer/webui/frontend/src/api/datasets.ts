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

export function useRenameDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { index: number; name: string }) =>
      api.patch<{ ok: boolean; name: string }>(
        `/api/dataset/${vars.index}/rename`,
        { name: vars.name },
      ),
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

// ---------------------------------------------------------------------------
// Bucket preview — given a target (W, H) area, ask the backend to walk the
// dataset's media files, probe their dimensions, and report which LTX-2
// aspect-ratio bucket each file lands in. Powers <BucketPreview> on the
// dataset settings panel.
// ---------------------------------------------------------------------------

export interface BucketRow {
  resolution: [number, number];
  aspect: number;
  count: number;
  items: string[];
}

export interface DurationBin {
  label: string;
  min_s: number;
  /** null marks the open-ended top bin (e.g. "30s+"). */
  max_s: number | null;
  count: number;
}

export interface DurationDistribution {
  bins: DurationBin[];
  count: number;
  total_s: number;
  avg_s: number;
  p50: number;
  p95: number;
  min_s: number;
  max_s: number;
}

export interface DatasetBucketsResponse {
  target_area: number;
  target_resolution: [number, number];
  buckets: BucketRow[];
  unreadable: string[];
  scanned: number;
  truncated: boolean;
  /** Histogram + summary stats over source-clip durations (videos only). */
  duration_distribution: DurationDistribution;
  video_count: number;
  image_count: number;
  /**
   * Estimated number of training samples the loader will produce with the
   * current target_frames / frame_extraction / target_fps / etc. — counts
   * each image as one sample plus the per-video chunking estimate.
   */
  estimated_training_samples: number;
  /**
   * Number of videos that will be silently dropped because they are shorter
   * than target_frames after FPS resampling and max_frames truncation.
   * Zero for `full` extraction mode (which uses whatever frames exist).
   */
  videos_dropped: number;
}

/** Per-call trainer-effective parameters for the sample-count estimator. */
export interface DatasetBucketsTrainerParams {
  target_frames?: number | null;
  frame_extraction?: string | null;
  frame_stride?: number | null;
  frame_sample?: number | null;
  target_fps?: number | null;
  max_frames?: number | null;
}

export function useDatasetBuckets(
  datasetIndex: number | null,
  width: number | null,
  height: number | null,
  slot: "target" | "reference" = "target",
  trainer: DatasetBucketsTrainerParams = {},
) {
  return useQuery<DatasetBucketsResponse>({
    queryKey: [
      "dataset",
      datasetIndex,
      "buckets",
      slot,
      width,
      height,
      trainer,
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (width != null) qs.set("width", String(width));
      if (height != null) qs.set("height", String(height));
      qs.set("slot", slot);
      // Forward only well-formed trainer params; the backend defaults to
      // the saved DatasetEntry values for any param we omit here.
      const t = trainer;
      if (t.target_frames != null && t.target_frames > 0) qs.set("target_frames", String(t.target_frames));
      if (t.frame_extraction) qs.set("frame_extraction", t.frame_extraction);
      if (t.frame_stride != null && t.frame_stride > 0) qs.set("frame_stride", String(t.frame_stride));
      if (t.frame_sample != null && t.frame_sample > 0) qs.set("frame_sample", String(t.frame_sample));
      if (t.target_fps != null && t.target_fps > 0) qs.set("target_fps", String(t.target_fps));
      if (t.max_frames != null && t.max_frames > 0) qs.set("max_frames", String(t.max_frames));
      return api.get<DatasetBucketsResponse>(
        `/api/dataset/${datasetIndex}/buckets?${qs.toString()}`,
      );
    },
    enabled:
      datasetIndex !== null &&
      width != null &&
      height != null &&
      width > 0 &&
      height > 0,
    staleTime: 5_000,
  });
}
