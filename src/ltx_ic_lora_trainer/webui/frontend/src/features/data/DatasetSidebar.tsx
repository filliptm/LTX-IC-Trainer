import { useState } from "react";
import { Plus, Video, Image, AudioLines, Trash2, X, AlertTriangle } from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { useProject } from "@/api/projects";
import { useCreateDataset, useDeleteDataset } from "@/api/datasets";
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

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-10 shrink-0 items-center justify-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Datasets
        </span>
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
            No datasets yet. Click + to create one.
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
                  onSelect={() => setSelected(idx)}
                  onRequestDelete={() => setDeleteTarget({ index: idx, name: displayName })}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

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
  onSelect,
  onRequestDelete,
}: {
  icon: typeof Video;
  name: string;
  type: string;
  isActive: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-label={`Select dataset ${name}`}
      className={cn(
        "group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-muted/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        isActive && "bg-muted text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{name}</div>
        <div className="text-[11px] text-muted-foreground">{type}</div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete();
            }}
            className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
            aria-label="Remove dataset"
          >
            <Trash2 className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove dataset</TooltipContent>
      </Tooltip>
    </button>
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
