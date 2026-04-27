import { useState } from "react";
import { FolderOpen, Trash2, Clock, Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useProject,
  useLoadProject,
  useCloseProject,
  useDiscoverProjects,
  type DiscoveredProject,
} from "@/api/projects";
import { useProjectStore } from "@/stores/projectStore";
import { formatDuration } from "@/lib/utils";

/**
 * Project load UI for the Data page.
 *
 * Shows three sections:
 * 1. Discovered projects — auto-scanned from the server's CWD
 * 2. Recent projects — from localStorage
 * 3. Manual path input — fallback for projects outside the scan root
 */
export function ProjectLoadDialog() {
  const { data: project } = useProject();
  const { data: discovered, isFetching: isScanning } = useDiscoverProjects();
  const loadProject = useLoadProject();
  const closeProject = useCloseProject();
  const { recentProjects, addRecent, removeRecent } = useProjectStore();
  const queryClient = useQueryClient();
  const [manualPath, setManualPath] = useState("");

  const handleLoad = async (path: string, name?: string) => {
    try {
      const res = await loadProject.mutateAsync(path);
      addRecent({
        path: res.project_path,
        name: (res.config.name as string) ?? name ?? path,
      });
      toast.success("Project loaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  };

  const handleRescan = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", "discover"] });
  };

  const discoveredProjects = discovered?.projects ?? [];

  return (
    <div className="space-y-4">
      {/* Currently loaded project */}
      {project?.loaded && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm font-medium">
              {(project.config?.name as string) ?? "—"}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground break-all">
              {project.project_path}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => closeProject.mutate()}
            >
              Close project
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Discovered projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Projects</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleRescan}
            disabled={isScanning}
            aria-label="rescan"
          >
            <RefreshCw className={`size-3.5 ${isScanning ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {discoveredProjects.length === 0 && !isScanning ? (
            <div className="text-xs text-muted-foreground">
              No <span className="font-mono">project.json</span> files found
              in the server directory. Create one below or use the manual path input.
            </div>
          ) : (
            <div className="space-y-1">
              {discoveredProjects.map((p) => (
                <DiscoveredProjectRow
                  key={p.path}
                  project={p}
                  isActive={project?.project_path === p.path}
                  onLoad={() => handleLoad(p.path, p.name)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent projects (from localStorage) */}
      {recentProjects.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Clock className="size-3.5" /> Recent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recentProjects.map((p) => (
                <div
                  key={p.path}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                >
                  <button
                    onClick={() => handleLoad(p.path, p.name)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                      {p.path}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {formatDuration((Date.now() - p.lastOpened) / 1000)} ago
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => removeRecent(p.path)}
                      aria-label="remove from recent"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual path input */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Load from path</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              className="flex-1 text-xs"
              placeholder="Path to project.json or project directory"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualPath.trim()) void handleLoad(manualPath);
              }}
            />
            <Button
              size="sm"
              onClick={() => manualPath.trim() && handleLoad(manualPath)}
              disabled={!manualPath.trim()}
            >
              <FolderOpen className="size-3.5" /> Load
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DiscoveredProjectRow({
  project,
  isActive,
  onLoad,
}: {
  project: DiscoveredProject;
  isActive: boolean;
  onLoad: () => void;
}) {
  return (
    <button
      onClick={onLoad}
      disabled={isActive}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
        isActive
          ? "bg-muted text-foreground"
          : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      <Database className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{project.name}</div>
        <div className="font-mono text-[10px] text-muted-foreground/70 truncate">
          {project.project_dir}
        </div>
      </div>
      {isActive && (
        <Badge variant="success" className="text-[10px] shrink-0">
          active
        </Badge>
      )}
    </button>
  );
}
