import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Database } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useProject,
  useLoadProject,
  useDiscoverProjects,
  type DiscoveredProject,
} from "@/api/projects";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import { DatasetSidebar } from "@/features/data/DatasetSidebar";
import { DatasetWorkspaceWithCount } from "@/features/data/DatasetWorkspace";
import { useSetContextPanel } from "@/components/layout/ContextPanelContext";

export const Route = createFileRoute("/")({
  component: DataPage,
});

// ---------------------------------------------------------------------------
// Data page
// ---------------------------------------------------------------------------

function DataPage() {
  const { data: project } = useProject();
  const selectedIndex = useUIStore((s) => s.selectedDatasetIndex);

  useSetContextPanel(<DatasetSidebar />);

  if (!project?.loaded) {
    return <NoProjectView />;
  }

  // Project loaded — check if there are datasets
  const datasets = (
    (project.config?.dataset as Record<string, unknown> | undefined)?.datasets as
      | unknown[]
      | undefined
  ) ?? [];

  if (datasets.length === 0 || selectedIndex === null) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex h-full items-center justify-center"
      >
        <div className="text-center max-w-sm">
          <div className="relative mx-auto mb-6 flex size-20 items-center justify-center">
            {/* Soft radial glow behind the icon */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-muted-foreground/10 via-muted-foreground/5 to-transparent blur-xl" />
            {/* Inner circle */}
            <div className="absolute inset-2 rounded-full border border-border/60 bg-muted/40" />
            <Database className="relative size-8 text-muted-foreground/70" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            {datasets.length === 0
              ? "No datasets yet"
              : "Select a dataset"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {datasets.length === 0
              ? "Create your first dataset using the + button in the sidebar."
              : "Choose a dataset from the sidebar to view and manage its contents."}
          </p>
        </div>
      </motion.div>
    );
  }

  // Clamp index in case datasets were deleted
  const clampedIndex = Math.min(selectedIndex, datasets.length - 1);

  return <DatasetWorkspaceWithCount datasetIndex={clampedIndex} />;
}

// ---------------------------------------------------------------------------
// No project view: show discovered projects + manual path input
// ---------------------------------------------------------------------------

function NoProjectView() {
  const { data: discovered } = useDiscoverProjects();
  const loadProject = useLoadProject();
  const { addRecent } = useProjectStore();

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

  const projects = discovered?.projects ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Data</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {projects.length > 0
            ? "Select a project to get started."
            : "No projects found. Create a project.json or load one manually."}
        </p>
      </div>

      {projects.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <DiscoveredProjectCard
              key={p.path}
              project={p}
              onLoad={() => handleLoad(p.path, p.name)}
            />
          ))}
        </div>
      )}

      <ManualLoadCard onLoad={handleLoad} />
    </div>
  );
}

function DiscoveredProjectCard({
  project,
  onLoad,
}: {
  project: DiscoveredProject;
  onLoad: () => void;
}) {
  return (
    <button
      onClick={onLoad}
      aria-label={`Load project ${project.name}`}
      className="rounded-lg border border-border bg-card p-4 text-left transition-all hover:bg-muted/60 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <div className="text-sm font-medium">{project.name}</div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
        {project.project_dir}
      </div>
    </button>
  );
}

function ManualLoadCard({ onLoad }: { onLoad: (path: string) => void }) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("path") as HTMLInputElement;
    if (input.value.trim()) onLoad(input.value.trim());
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Load from path</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            name="path"
            className="flex-1 text-xs"
            placeholder="Path to project.json or project directory"
          />
          <Button type="submit" size="sm">
            <FolderOpen className="size-3.5" /> Load
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
