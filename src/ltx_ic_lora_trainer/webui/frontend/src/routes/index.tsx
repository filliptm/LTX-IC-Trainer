import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Database, FolderPlus, ImagePlus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  useProject,
  useLoadProject,
  useCreateProject,
  useDiscoverProjects,
  useRenameProject,
  useDeleteProject,
  useUploadProjectThumbnail,
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
  const setSelectedIndex = useUIStore((s) => s.setSelectedDatasetIndex);

  useSetContextPanel(<DatasetSidebar />);

  const datasets = (
    (project?.config?.dataset as Record<string, unknown> | undefined)?.datasets as
      | unknown[]
      | undefined
  ) ?? [];

  // A project always ships with one dataset. Auto-select it so the user
  // lands directly on the workspace instead of an empty "pick a dataset"
  // state. Only kicks in when nothing is selected — the user can still
  // pick another in the multi-dataset case.
  useEffect(() => {
    if (project?.loaded && selectedIndex === null && datasets.length > 0) {
      setSelectedIndex(0);
    }
  }, [project?.loaded, selectedIndex, datasets.length, setSelectedIndex]);

  if (!project?.loaded) {
    return <NoProjectView />;
  }

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
              ? "Empty project"
              : "Select a dataset"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {datasets.length === 0
              ? "This project has no dataset. Use the sidebar to add one."
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
  const createProject = useCreateProject();
  const { addRecent } = useProjectStore();
  const [showCreate, setShowCreate] = useState(false);

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

  const handleCreate = async (name: string) => {
    try {
      const res = await createProject.mutateAsync({ name });
      addRecent({
        path: res.project_path,
        name: (res.config.name as string) ?? name,
      });
      toast.success("Project created");
      setShowCreate(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create project");
    }
  };

  const projects = discovered?.projects ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {projects.length > 0
              ? "Select a project to get started, or create a new one."
              : "No projects yet — create your first one to get started."}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Projects live under <span className="text-foreground/80">projects/</span> in the repo.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <FolderPlus className="size-3.5" /> New project
        </Button>
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

      <CreateProjectDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
        pending={createProject.isPending}
      />
    </div>
  );
}

function CreateProjectDialog({
  open,
  onClose,
  onCreate,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");

  const handleClose = () => {
    if (!pending) {
      setName("");
      onClose();
    }
  };

  const canSubmit = name.trim().length > 0 && !pending;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate(name.trim());
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
              <FolderPlus className="size-5 text-primary" />
            </div>
            <DialogTitle>New project</DialogTitle>
          </div>
          <DialogDescription>
            A new directory will be created under <span className="font-mono text-xs">projects/</span>.
            Datasets you add will be stored at <span className="font-mono text-xs">projects/&lt;name&gt;/datasets/</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="new-project-name">Name</Label>
            <Input
              id="new-project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My LoRA"
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              The name is slugified to pick a directory (e.g. "My LoRA" → <span className="font-mono">my_lora</span>).
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function DiscoveredProjectCard({
  project,
  onLoad,
}: {
  project: DiscoveredProject;
  onLoad: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameTarget, setRenameTarget] = useState<DiscoveredProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiscoveredProject | null>(null);
  const uploadThumbnail = useUploadProjectThumbnail();

  // Cache-bust the thumbnail URL on every render so a freshly-uploaded
  // image replaces the previous one immediately. The mtime is updated by
  // the discover query each refetch, so this is stable between unrelated
  // renders.
  const thumbUrl = project.thumbnail
    ? `/api/project/${encodeURIComponent(project.slug)}/thumbnail?t=${project.mtime}`
    : null;

  const handleThumbnailPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await uploadThumbnail.mutateAsync({ slug: project.slug, file });
      toast.success("Thumbnail updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload thumbnail");
    }
  };

  return (
    <>
      <div className="group relative">
        <button
          onClick={onLoad}
          aria-label={`Load project ${project.name}`}
          className="block w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:bg-muted/40 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div className="aspect-video w-full bg-muted/40 overflow-hidden">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <Database className="size-8" />
              </div>
            )}
          </div>
          <div className="p-3">
            <div className="truncate text-sm font-medium">{project.name}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {project.slug}
            </div>
          </div>
        </button>

        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-md bg-card/90 p-1 text-muted-foreground shadow-sm backdrop-blur hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Project options"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <ImagePlus className="size-3.5 shrink-0 text-muted-foreground" />
                <span>{project.thumbnail ? "Change thumbnail" : "Set thumbnail"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRenameTarget(project)}>
                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => setDeleteTarget(project)}>
                <Trash2 className="size-3.5 shrink-0" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handleThumbnailPick}
        />
      </div>

      <RenameProjectDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
      />
      <DeleteProjectDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

function RenameProjectDialog({
  target,
  onClose,
}: {
  target: DiscoveredProject | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const renameProject = useRenameProject();

  // Re-seed the input each time the dialog opens for a new project.
  useEffect(() => {
    if (target) setName(target.name);
  }, [target]);

  const open = target !== null;
  const pending = renameProject.isPending;
  const trimmed = name.trim();
  const canSubmit = !!target && trimmed.length > 0 && trimmed !== target.name && !pending;

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!target || !canSubmit) return;
    try {
      await renameProject.mutateAsync({ slug: target.slug, name: trimmed });
      toast.success("Project renamed");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
              <Pencil className="size-5 text-primary" />
            </div>
            <DialogTitle>Rename project</DialogTitle>
          </div>
          <DialogDescription>
            Renames the directory under <span className="font-mono text-xs">projects/</span> as well.
            Cache files inside the project keep working — their absolute paths
            are rewritten in <span className="font-mono text-xs">project.json</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="rename-project-name">New name</Label>
            <Input
              id="rename-project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {pending ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function DeleteProjectDialog({
  target,
  onClose,
}: {
  target: DiscoveredProject | null;
  onClose: () => void;
}) {
  const deleteProject = useDeleteProject();
  const open = target !== null;
  const pending = deleteProject.isPending;

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleDelete = async () => {
    if (!target) return;
    try {
      await deleteProject.mutateAsync(target.slug);
      toast.success(`Project "${target.name}" deleted`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <DialogTitle>Delete project</DialogTitle>
        </div>
        <DialogDescription>
          Permanently removes <strong>{target?.name}</strong> and everything in
          its directory — cache files, dataset media, training output, and
          checkpoints. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={handleClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={pending}>
          {pending ? "Deleting…" : "Delete project"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

