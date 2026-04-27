import { Database, Music, Image, Video, Link2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  useProject,
  useDiscoverProjects,
  useAutoPopulate,
  type DiscoveredDataset,
} from "@/api/projects";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, typeof Video> = {
  video: Video,
  image: Image,
  audio: Music,
};

export function DatasetList() {
  const { data: project } = useProject();
  const { data: discovered } = useDiscoverProjects();
  const { selectedDatasetIndex, setSelectedDatasetIndex } = useUIStore();

  const datasets =
    (project?.config?.dataset as Record<string, unknown> | undefined)?.datasets as
      | Array<Record<string, unknown>>
      | undefined;

  const hasConfiguredDatasets = project?.loaded && datasets && datasets.length > 0;
  const discoveredDatasets = discovered?.datasets ?? [];

  return (
    <div className="flex flex-col">
      {hasConfiguredDatasets && (
        <>
          <div className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Project · {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
          </div>
          <div className="p-2 text-xs">
            {datasets.map((ds, i) => {
              const dir = (ds.directory as string) || "";
              const name = dir
                ? dir.split(/[\\/]/).filter(Boolean).pop()!
                : `Dataset ${i + 1}`;
              const type = (ds.type as string) || "video";
              const Icon = TYPE_ICON[type] || Database;
              const isSelected = selectedDatasetIndex === i;
              const isEmpty = !dir;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDatasetIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    isSelected
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{name}</div>
                    {isEmpty && (
                      <div className="text-[10px] text-amber-400">no directory set</div>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">
                    {type}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {discoveredDatasets.length > 0 && (
        <>
          <div className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On disk
          </div>
          <div className="p-2 text-xs">
            {discoveredDatasets.map((ds) => (
              <DiscoveredDatasetRow key={ds.path} dataset={ds} />
            ))}
          </div>
        </>
      )}

      {!hasConfiguredDatasets && discoveredDatasets.length === 0 && (
        <div className="p-4 text-xs text-muted-foreground">
          No datasets found. Place media files alongside .txt caption
          files in a subdirectory.
        </div>
      )}
    </div>
  );
}

function DiscoveredDatasetRow({ dataset }: { dataset: DiscoveredDataset }) {
  const { data: project } = useProject();
  const autoPopulate = useAutoPopulate();
  const Icon = TYPE_ICON[dataset.type] || Database;

  // Check if this dataset is already connected to the project.
  const datasets =
    (project?.config?.dataset as Record<string, unknown> | undefined)?.datasets as
      | Array<Record<string, unknown>>
      | undefined;
  const isConnected = datasets?.some((ds) => (ds.directory as string) === dataset.path);

  const cs = dataset.cache_status;
  const fullyLatent = cs.latent_count >= cs.total_assets && cs.total_assets > 0;
  const fullyText = cs.text_encoder_count >= cs.total_assets && cs.total_assets > 0;

  const handleConnect = async () => {
    try {
      await autoPopulate.mutateAsync({ dataset_index: 0, discovered: dataset });
      toast.success(`Connected ${dataset.name}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to connect");
    }
  };

  return (
    <button
      onClick={handleConnect}
      disabled={isConnected || autoPopulate.isPending || !project?.loaded}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
        isConnected
          ? "text-foreground bg-muted/40"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
      title={isConnected ? "Already connected" : `Connect ${dataset.name} to project`}
    >
      <Icon className="size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{dataset.name}</div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
          <span>{dataset.media_count} files</span>
          {cs.total_assets > 0 && (
            <>
              <span className={fullyLatent ? "text-emerald-400" : "text-amber-400"}>
                {cs.latent_count}/{cs.total_assets} lat
              </span>
              <span className={fullyText ? "text-emerald-400" : "text-amber-400"}>
                {cs.text_encoder_count}/{cs.total_assets} te
              </span>
            </>
          )}
        </div>
      </div>
      {isConnected ? (
        <Check className="size-3.5 shrink-0 text-emerald-400" />
      ) : (
        <Link2 className="size-3.5 shrink-0" />
      )}
    </button>
  );
}
