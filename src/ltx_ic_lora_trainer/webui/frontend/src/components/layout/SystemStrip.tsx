import { MemoryStick, Microchip, Thermometer, HardDrive, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useSystemInfo, type SystemInfo } from "@/api/system";
import { cn } from "@/lib/utils";

/**
 * Live system telemetry strip for the global Header.
 *
 * All values are color-coded:
 *   green  — healthy / low usage
 *   amber  — moderate (>=70% usage, >=75C)
 *   red    — critical (>=90% usage, >=85C)
 */
export function SystemStrip() {
  const { data: sys, isError } = useSystemInfo();

  if (isError) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-destructive">
            <WifiOff className="h-3.5 w-3.5" />
            <span>offline</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>System info unavailable</TooltipContent>
      </Tooltip>
    );
  }

  if (!sys) {
    return (
      <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
        <Item icon={MemoryStick}>—</Item>
        <Divider />
        <Item icon={Microchip}>—</Item>
      </div>
    );
  }

  const ramPct = sys.ram.percent;
  const gpu0 = sys.gpus[0];
  const extraGpus = sys.gpus.length - 1;

  return (
    <div className="hidden sm:flex items-center gap-3 text-xs">
      <RamItem sys={sys} ramPct={ramPct} />
      {gpu0 && (
        <>
          <Divider />
          <GpuItem gpu={gpu0} />
        </>
      )}
      <Divider className="hidden lg:block" />
      <DiskItem sys={sys} />
      {extraGpus > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 cursor-default">
                +{extraGpus}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line">
            {sys.gpus
              .slice(1)
              .map((g, i) => {
                const vUsed = (g.vram_total_mb - g.vram_free_mb) / 1024;
                const vTotal = g.vram_total_mb / 1024;
                const vFree = g.vram_free_mb / 1024;
                return `GPU ${i + 1}: ${g.name}\n  ${vUsed.toFixed(1)}/${vTotal.toFixed(1)} GB (${vFree.toFixed(1)} GB free) · ${g.temperature}°C`;
              })
              .join("\n\n")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function RamItem({ sys, ramPct }: { sys: SystemInfo; ramPct: number }) {
  const used = sys.ram.used_gb.toFixed(1);
  const total = sys.ram.total_gb.toFixed(1);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 cursor-default">
          <MemoryStick className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="tabular-nums">
            <span className={cn("tabular-nums whitespace-nowrap", usageColor(ramPct))}>{used}</span>
            <span className="text-muted-foreground"> / {total} GB</span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        RAM: {used} / {total} GB ({ramPct.toFixed(0)}%)
        <br />
        CPU: {sys.cpu.model} ({sys.cpu.cores} cores)
      </TooltipContent>
    </Tooltip>
  );
}

function GpuItem({ gpu }: { gpu: SystemInfo["gpus"][number] }) {
  const vramUsedGb = (gpu.vram_total_mb - gpu.vram_free_mb) / 1024;
  const vramFreeGb = gpu.vram_free_mb / 1024;
  const vramTotalGb = gpu.vram_total_mb / 1024;
  const vramPct = vramTotalGb > 0 ? (vramUsedGb / vramTotalGb) * 100 : 0;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default">
            <Microchip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 tabular-nums">
              <span className="font-medium whitespace-nowrap">{gpu.name}</span>
              <span className="text-muted-foreground/40">|</span>
              <span className="whitespace-nowrap">
                <span className={usageColor(vramPct)}>{vramUsedGb.toFixed(1)}</span>
                <span className="text-muted-foreground"> / {vramTotalGb.toFixed(1)} GB</span>
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {gpu.name}
          <br />
          VRAM: {vramUsedGb.toFixed(1)} / {vramTotalGb.toFixed(1)} GB ({vramFreeGb.toFixed(1)} GB free)
          <br />
          Utilization: {gpu.utilization}%
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hidden lg:flex items-center gap-1.5 cursor-default">
            <Thermometer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className={cn("tabular-nums whitespace-nowrap", tempColor(gpu.temperature))}>
              {gpu.temperature}°C
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>GPU temperature</TooltipContent>
      </Tooltip>
    </>
  );
}

function DiskItem({ sys }: { sys: SystemInfo }) {
  const diskPct = sys.disk.total_gb > 0
    ? ((sys.disk.total_gb - sys.disk.free_gb) / sys.disk.total_gb) * 100
    : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hidden lg:flex items-center gap-1.5 cursor-default">
          <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="tabular-nums">
            <span className={cn("whitespace-nowrap", usageColor(diskPct))}>
              {sys.disk.free_gb.toFixed(0)} GB
            </span>
            <span className="text-muted-foreground"> free</span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Disk: {sys.disk.free_gb.toFixed(0)} GB free / {sys.disk.total_gb.toFixed(0)} GB total
      </TooltipContent>
    </Tooltip>
  );
}

function Item({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="tabular-nums">{children}</div>
    </div>
  );
}

function Divider({ className }: { className?: string }) {
  return <div className={cn("h-5 w-px bg-border", className)} />;
}

function usageColor(pct: number): string {
  if (pct >= 90) return "text-[hsl(var(--status-danger))] font-medium";
  if (pct >= 70) return "text-[hsl(var(--status-warning))]";
  return "text-[hsl(var(--status-success))]";
}

function tempColor(temp: number): string {
  if (temp >= 85) return "text-[hsl(var(--status-danger))] font-medium";
  if (temp >= 75) return "text-[hsl(var(--status-warning))]";
  return "text-[hsl(var(--status-success))]";
}
