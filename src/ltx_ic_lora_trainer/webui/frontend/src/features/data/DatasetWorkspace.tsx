import { useState } from "react";

import { useProject } from "@/api/projects";
import { useDatasetAssets } from "@/api/datasets";
import { DatasetToolbar } from "./DatasetToolbar";
import { MediaGrid } from "./MediaGrid";
import { DatasetSettings } from "./DatasetSettings";

interface DatasetWorkspaceProps {
  datasetIndex: number;
}

/**
 * Main workspace: toolbar + media grid + settings panel.
 * Fills the full available height edge-to-edge. The settings panel's
 * left border flows directly from the main Header's bottom border.
 */
export function DatasetWorkspaceWithCount({ datasetIndex }: DatasetWorkspaceProps) {
  const { data: project } = useProject();
  const [searchFilter, setSearchFilter] = useState("");

  const datasets = (
    (project?.config?.dataset as Record<string, unknown> | undefined)?.datasets as
      | Record<string, unknown>[]
      | undefined
  ) ?? [];
  const entry = datasets[datasetIndex];

  const captionExtension = (entry?.caption_extension as string) || ".txt";
  const { data: assetsData } = useDatasetAssets(datasetIndex, captionExtension);
  const totalAssets = assetsData?.total ?? 0;

  if (!entry) return null;

  const targetDir = (entry.directory as string) || "";
  const referenceDir = (entry.reference_directory as string) || "";

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border bg-card/40 px-4 py-3">
          <DatasetToolbar
            datasetIndex={datasetIndex}
            totalAssets={totalAssets}
            searchFilter={searchFilter}
            onSearchChange={setSearchFilter}
          />
        </div>

        <div className="sunken-wrapper min-h-0 flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto scrollbar-thin p-4">
            <MediaGrid
              datasetIndex={datasetIndex}
              targetDir={targetDir}
              referenceDir={referenceDir}
              captionExtension={captionExtension}
              searchFilter={searchFilter}
            />
          </div>
        </div>
      </div>

      <DatasetSettings datasetIndex={datasetIndex} />
    </div>
  );
}
