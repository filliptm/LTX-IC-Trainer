import { api } from "./client";

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface BrowseResponse {
  path: string;
  entries: DirEntry[];
  parent: string | null;
}

export async function browseDir(path: string, showFiles = false): Promise<BrowseResponse> {
  const q = new URLSearchParams({ path, show_files: String(showFiles) }).toString();
  return api.get<BrowseResponse>(`/api/fs/browse?${q}`);
}

export async function checkExists(
  path: string,
): Promise<{ exists: boolean; is_file: boolean; is_dir: boolean }> {
  const q = new URLSearchParams({ path }).toString();
  return api.get<{ exists: boolean; is_file: boolean; is_dir: boolean }>(`/api/fs/exists?${q}`);
}

export async function getCwd(): Promise<{ cwd: string }> {
  return api.get<{ cwd: string }>("/api/fs/cwd");
}
