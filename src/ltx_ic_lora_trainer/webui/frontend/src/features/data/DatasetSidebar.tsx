import { useEffect, useState } from "react";
import { Plus, Video, Image, AudioLines, Trash2, X, AlertTriangle, Pencil, MoreVertical } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
import { Label } from "@/components/ui/label";
import { useProject } from "@/api/projects";
import { useCreateDataset, useDeleteDataset, useRenameDataset } from "@/api/datasets";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

const TYPE_ICONS = {
  video: Video,
  image: Image,
  audio: AudioLines,
} as const;

interface DatasetEntry {
  name: string;
  type: "video" | "image" | "audio";
  directory: string;
  thumbnail: string;
}

/**
 * Left sidebar: list of datasets with a create form.
 * Injected into the ContextPanel slot by the Data page.
 */
export function DatasetSidebar() {
  const { data: project } = useProject();
  const selectedIndex = useUIStore((s) => s.selectedDatasetIndex);
  const setSelected = useUIStore((s) => s.setSelectedDatasetIndex);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ index: number; name: string } | null>(null);
  const deleteDataset = useDeleteDataset();

  const datasets = (
    (project?.config?.dataset as Record<string, unknown> | undefined)?.datasets as
      | DatasetEntry[]
      | undefined
  ) ?? [];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { index, name } = deleteTarget;
    try {
      await deleteDataset.mutateAsync(index);
      // Adjust selection
      if (selectedIndex === index) setSelected(null);
      else if (selectedIndex !== null && selectedIndex > index) setSelected(selectedIndex - 1);
      toast.success(`Dataset "${name}" removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
    setDeleteTarget(null);
  };

  // Most projects have exactly one dataset — collapse the list UI in that
  // case so the sidebar shows the dataset's identity inline, with an
  // "Add another dataset" link at the bottom for advanced cases (mixed
  // media types, multiple IC-LoRA reference sets).
  const isSingleDataset = datasets.length === 1 && !showCreate;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-10 shrink-0 items-center justify-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isSingleDataset ? "Dataset" : "Datasets"}
        </span>
        {!isSingleDataset && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 h-7 w-7 p-0"
                onClick={() => setShowCreate(!showCreate)}
              >
                {showCreate ? <X className="size-4" /> : <Plus className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{showCreate ? "Cancel" : "New dataset"}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {showCreate && (
        <CreateDatasetInline
          onCreated={(idx) => {
            setSelected(idx);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {datasets.length === 0 && !showCreate && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No dataset yet. Click + to add one.
          </div>
        )}
        <AnimatePresence initial={false}>
          {datasets.map((ds, idx) => {
            const Icon = TYPE_ICONS[ds.type] ?? Video;
            const displayName = ds.name || ds.directory.split(/[\\/]/).filter(Boolean).pop() || `Dataset ${idx + 1}`;
            const isActive = selectedIndex === idx;

            return (
              <motion.div
                key={ds.name || idx}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <DatasetCard
                  icon={Icon}
                  name={displayName}
                  type={ds.type}
                  isActive={isActive}
                  allowDelete={!isSingleDataset}
                  onSelect={() => setSelected(idx)}
                  onRequestRename={() => setRenameTarget({ index: idx, name: displayName })}
                  onRequestDelete={() => setDeleteTarget({ index: idx, name: displayName })}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {isSingleDataset && (
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 border-t border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus className="size-3" /> Add another dataset
          </span>
        </button>
      )}

      {/* Rename dialog */}
      <RenameDatasetDialog target={renameTarget} onClose={() => setRenameTarget(null)} />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <DialogTitle>Delete dataset</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            This removes the dataset from your project configuration.
            Files on disk will not be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirmDelete}
            disabled={deleteDataset.isPending}
          >
            {deleteDataset.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function DatasetCard({
  icon: Icon,
  name,
  type,
  isActive,
  allowDelete,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: {
  icon: typeof Video;
  name: string;
  type: string;
  isActive: boolean;
  allowDelete: boolean;
  onSelect: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-center gap-2.5 px-3 py-2 transition-all hover:bg-muted/60",
        isActive && "bg-muted text-foreground",
      )}
    >
      <button
        onClick={onSelect}
        aria-label={`Select dataset ${name}`}
        className={cn(
          "flex flex-1 items-center gap-2.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{name}</div>
          <div className="text-[11px] text-muted-foreground">{type}</div>
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:block focus:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dataset options"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onRequestRename}>
            <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
            <span>Rename</span>
          </DropdownMenuItem>
          {allowDelete && (
            <DropdownMenuItem destructive onSelect={onRequestDelete}>
              <Trash2 className="size-3.5 shrink-0" />
              <span>Delete</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CreateDatasetInline({
  onCreated,
  onCancel,
}: {
  onCreated: (index: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"video" | "image" | "audio">("video");
  const createDataset = useCreateDataset();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await createDataset.mutateAsync({ name: name.trim(), type });
      toast.success(`Dataset "${name}" created`);
      onCreated(res.index);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create dataset");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-border p-3">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dataset name"
        className="h-8 text-xs"
      />
      <Select
        value={type}
        onChange={(e) => setType(e.target.value as "video" | "image" | "audio")}
        className="h-8 text-xs"
      >
        <option value="video">Video</option>
        <option value="image">Image</option>
        <option value="audio">Audio</option>
      </Select>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-7 flex-1 text-xs" disabled={!name.trim() || createDataset.isPending}>
          {createDataset.isPending ? "Creating..." : "Create"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RenameDatasetDialog({
  target,
  onClose,
}: {
  target: { index: number; name: string } | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const renameDataset = useRenameDataset();

  useEffect(() => {
    if (target) setName(target.name);
  }, [target]);

  const open = target !== null;
  const pending = renameDataset.isPending;
  const trimmed = name.trim();
  const canSubmit = !!target && trimmed.length > 0 && trimmed !== target.name && !pending;

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!target || !canSubmit) return;
    try {
      await renameDataset.mutateAsync({ index: target.index, name: trimmed });
      toast.success("Dataset renamed");
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
            <DialogTitle>Rename dataset</DialogTitle>
          </div>
          <DialogDescription>
            Updates the display name only. Files and cache directories on
            disk are left untouched so existing caches keep working.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="rename-dataset-name">New name</Label>
            <Input
              id="rename-dataset-name"
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
