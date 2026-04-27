import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface AssetItem {
  filename: string;
  type: "video" | "image" | "audio";
  size_bytes: number;
  has_caption: boolean;
}

interface AssetsResponse {
  directory: string;
  total: number;
  offset: number;
  assets: AssetItem[];
}

interface CaptionReadResponse {
  content: string;
}

export function useDatasetAssets(
  directory: string | undefined,
  captionExtension: string = ".txt"
) {
  return useQuery<AssetsResponse>({
    queryKey: ["captions", "assets", directory, captionExtension],
    queryFn: () =>
      api.get<AssetsResponse>(
        `/api/captions/assets?directory=${encodeURIComponent(directory!)}&caption_extension=${encodeURIComponent(captionExtension)}&limit=5000`
      ),
    enabled: !!directory,
  });
}

export function useCaptionContent(path: string | undefined) {
  return useQuery<CaptionReadResponse>({
    queryKey: ["captions", "read", path],
    queryFn: () =>
      api.get<CaptionReadResponse>(
        `/api/captions/read?path=${encodeURIComponent(path!)}`
      ),
    enabled: !!path,
  });
}

export function useSaveCaption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { path: string; content: string }) =>
      api.post("/api/captions/write", body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["captions", "read", variables.path] });
      qc.invalidateQueries({ queryKey: ["captions", "assets"] });
    },
  });
}

export function useUploadAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      directory: string;
      files: File[];
      createCaptions?: boolean;
      captionExtension?: string;
    }) => {
      const fd = new FormData();
      fd.append("directory", params.directory);
      for (const f of params.files) fd.append("files", f);
      fd.append("create_captions", String(params.createCaptions ?? true));
      fd.append("caption_extension", params.captionExtension ?? ".txt");
      return api.postForm<{ ok: boolean; uploaded: string[]; count: number }>(
        "/api/captions/upload",
        fd,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["captions", "assets"] });
      qc.invalidateQueries({ queryKey: ["project", "discover"] });
    },
  });
}
