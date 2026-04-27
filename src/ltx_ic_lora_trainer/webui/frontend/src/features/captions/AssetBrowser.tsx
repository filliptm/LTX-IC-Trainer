import { useMemo, useState } from "react";
import { Search, Video, Image, Music } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDatasetAssets, type AssetItem } from "@/api/captions";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, typeof Video> = {
  video: Video,
  image: Image,
  audio: Music,
};

interface AssetBrowserProps {
  directory: string | undefined;
  captionExtension?: string;
  selectedAsset: string | null;
  onSelectAsset: (filename: string) => void;
}

/**
 * Context-panel content for the Captions page.
 * Scrollable filterable list of assets with caption-status dots.
 */
export function AssetBrowser({
  directory,
  captionExtension = ".txt",
  selectedAsset,
  onSelectAsset,
}: AssetBrowserProps) {
  const { data } = useDatasetAssets(directory, captionExtension);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!data?.assets) return [];
    if (!filter) return data.assets;
    const lower = filter.toLowerCase();
    return data.assets.filter((a) => a.filename.toLowerCase().includes(lower));
  }, [data?.assets, filter]);

  if (!directory) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a dataset on the Data tab first.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Assets{data ? ` · ${data.total}` : ""}
      </div>
      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto scrollbar-thin px-1">
        {filtered.map((asset) => (
          <AssetRow
            key={asset.filename}
            asset={asset}
            isSelected={selectedAsset === asset.filename}
            onClick={() => onSelectAsset(asset.filename)}
          />
        ))}
        {filtered.length === 0 && data && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {filter ? "No matches." : "No media files found."}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  isSelected,
  onClick,
}: {
  asset: AssetItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = TYPE_ICON[asset.type] || Video;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
        isSelected
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate flex-1">{asset.filename}</span>
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          asset.has_caption ? "bg-emerald-500" : "bg-amber-400"
        )}
        aria-label={asset.has_caption ? "captioned" : "missing caption"}
      />
    </button>
  );
}
