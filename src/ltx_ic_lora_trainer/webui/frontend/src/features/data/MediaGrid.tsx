import { motion } from "motion/react";
import { useDatasetAssets } from "@/api/datasets";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaTile } from "./MediaTile";

interface MediaGridProps {
  datasetIndex: number;
  targetDir: string;
  referenceDir: string;
  captionExtension: string;
  searchFilter: string;
}

/**
 * Responsive grid of MediaTile components showing all assets in a dataset.
 */
export function MediaGrid({
  datasetIndex,
  targetDir,
  referenceDir,
  captionExtension,
  searchFilter,
}: MediaGridProps) {
  const { data, isLoading, error } = useDatasetAssets(datasetIndex, captionExtension);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-border">
              <Skeleton className="aspect-video rounded-none" />
              <Skeleton className="aspect-video rounded-none" />
            </div>
            <div className="p-2">
              <Skeleton className="h-[60px] rounded-md" />
            </div>
            <div className="border-t border-border px-2 py-1">
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        Failed to load assets: {error instanceof Error ? error.message : "Unknown error"}
      </motion.div>
    );
  }

  const assets = data?.assets ?? [];
  const filtered = searchFilter
    ? assets.filter((a) => a.filename.toLowerCase().includes(searchFilter.toLowerCase()))
    : assets;

  if (filtered.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="relative overflow-hidden rounded-lg border border-dashed border-border/80 bg-muted/20 p-12 text-center"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-muted-foreground/5 via-transparent to-transparent" />
        <p className="relative text-sm text-muted-foreground">
          {assets.length === 0
            ? "No media files yet. Drag and drop files above to upload."
            : "No files match your search."}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {filtered.map((asset, i) => (
        <MediaTile
          key={asset.filename}
          asset={asset}
          datasetIndex={datasetIndex}
          targetDir={targetDir}
          referenceDir={referenceDir}
          captionExtension={captionExtension}
          tileIndex={i}
        />
      ))}
    </div>
  );
}
