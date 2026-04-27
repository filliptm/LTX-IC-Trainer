import { useCallback, useRef, useState } from "react";
import { Upload, FolderInput, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { useDatasetUpload } from "@/api/datasets";
import { cn } from "@/lib/utils";

interface DatasetToolbarProps {
  datasetIndex: number;
  totalAssets: number;
  searchFilter: string;
  onSearchChange: (value: string) => void;
}

/**
 * Toolbar above the media grid: two side-by-side drop zones
 * (target + reference) plus search and count.
 */
export function DatasetToolbar({
  datasetIndex,
  totalAssets,
  searchFilter,
  onSearchChange,
}: DatasetToolbarProps) {
  const upload = useDatasetUpload();
  const targetInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (files: File[], slot: "target" | "reference") => {
      if (files.length === 0) return;
      try {
        const res = await upload.mutateAsync({ index: datasetIndex, files, slot });
        toast.success(`Uploaded ${res.count} file(s) to ${slot}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [datasetIndex, upload],
  );

  return (
    <div className="space-y-2">
      {/* Two drop zones side by side */}
      <div className="grid grid-cols-2 gap-3">
        <DropZone
          label="Reference files"
          icon={FolderInput}
          inputRef={refInputRef}
          onFiles={(files) => handleUpload(files, "reference")}
          disabled={upload.isPending}
        />
        <DropZone
          label="Target files"
          icon={Upload}
          inputRef={targetInputRef}
          onFiles={(files) => handleUpload(files, "target")}
          disabled={upload.isPending}
        />
      </div>

      {/* Search + count row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter files..."
            className="h-8 pl-7 text-xs"
          />
        </div>
        <span className="text-xs text-muted-foreground">{totalAssets} files</span>
      </div>
    </div>
  );
}

function DropZone({
  label,
  icon: Icon,
  inputRef,
  onFiles,
  disabled,
}: {
  label: string;
  icon: typeof Upload;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
  disabled: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
    [onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label.toLowerCase()}`}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 cursor-pointer",
        "transition-[transform,border-color,background-color,box-shadow] duration-300 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        dragOver
          ? "border-foreground/40 bg-muted/50 scale-[1.01] shadow-[inset_0_0_20px_0_hsl(var(--foreground)/0.04)]"
          : "border-border hover:border-muted-foreground/50 hover:bg-muted/30",
      )}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      {disabled ? (
        <>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-xs font-medium">Uploading...</span>
        </>
      ) : (
        <>
          <Icon className="size-5 text-muted-foreground" />
          <span className="text-xs font-medium">{label}</span>
          <span className="text-[10px] text-muted-foreground">
            Drag & drop or click to browse
          </span>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
        disabled={disabled}
      />
    </div>
  );
}
