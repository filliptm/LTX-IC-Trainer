import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface ProjectState {
  loaded: boolean;
  config: Record<string, unknown> | null;
  project_path: string | null;
}

export function useProject() {
  return useQuery<ProjectState>({
    queryKey: ["project"],
    queryFn: () => api.get<ProjectState>("/api/project"),
  });
}

export function useProjectSchema() {
  return useQuery({
    queryKey: ["project", "schema"],
    queryFn: () => api.get<Record<string, unknown>>("/api/project/schema"),
    staleTime: Infinity,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.post<{ ok: boolean; config: Record<string, unknown>; project_path: string }>(
        "/api/project",
        config
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.put<{ ok: boolean; config: Record<string, unknown> }>("/api/project", config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project"] }),
  });
}

export function useLoadProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      api.post<{ ok: boolean; config: Record<string, unknown>; project_path: string }>(
        "/api/project/load",
        { path }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project"] }),
  });
}

export function useCloseProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ ok: boolean }>("/api/project"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project"] }),
  });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { slug: string; name: string }) =>
      api.post<{ ok: boolean; slug: string; name: string; project_path: string }>(
        `/api/project/${encodeURIComponent(vars.slug)}/rename`,
        { name: vars.name },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      api.delete<{ ok: boolean; slug: string }>(
        `/api/project/${encodeURIComponent(slug)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

export function useUploadProjectThumbnail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { slug: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", vars.file);
      return api.postForm<{ ok: boolean; thumbnail: string }>(
        `/api/project/${encodeURIComponent(vars.slug)}/thumbnail`,
        formData,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoveredProject {
  name: string;
  slug: string;
  path: string;
  project_dir: string;
  mtime: number;
  thumbnail: string;
}

export interface DiscoveredDataset {
  name: string;
  path: string;
  media_count: number;
  type: "video" | "image" | "audio";
  parent_dir: string;
  siblings: {
    cache_directory?: string;
    reference_directory?: string;
    reference_cache_directory?: string;
    output_dir?: string;
    logging_dir?: string;
  };
  cache_status: {
    latent_count: number;
    text_encoder_count: number;
    total_assets: number;
  };
  toml_config: Record<string, unknown> | null;
}

export interface DiscoverResult {
  root: string;
  projects: DiscoveredProject[];
  datasets: DiscoveredDataset[];
}

export function useAutoPopulate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { dataset_index: number; discovered: DiscoveredDataset }) =>
      api.post<{ ok: boolean; config: Record<string, unknown> }>(
        "/api/project/auto-populate",
        body,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project"] }),
  });
}

export function useDiscoverProjects(root?: string) {
  const qs = root ? `?root=${encodeURIComponent(root)}` : "";
  return useQuery<DiscoverResult>({
    queryKey: ["project", "discover", root ?? ""],
    queryFn: () => api.get<DiscoverResult>(`/api/project/discover${qs}`),
    staleTime: 30_000,
  });
}
