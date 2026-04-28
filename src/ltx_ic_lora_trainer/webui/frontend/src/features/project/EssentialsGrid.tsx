import type { ReactNode } from "react";
import { motion } from "motion/react";

import { useUIStore } from "@/stores/uiStore";
import { Switch } from "@/components/ui/switch";

import { BasicSection } from "./sections/BasicSection";
import { LoRASection } from "./sections/LoRASection";
import { OptimizerSection } from "./sections/OptimizerSection";
import { ScheduleSection } from "./sections/ScheduleSection";

/**
 * Single-page "essentials" view for the Train tab.
 *
 * Renders Model & paths, LoRA, Optimizer, and Schedule as four card-shaped
 * sections in a responsive 2-column grid. The full sidebar-and-tabs view
 * is only used when the user opts into Advanced+Research via the toggle
 * (lives in the page header here, mirroring the one in the sidebar).
 *
 * The four section components do their own field gating (Row hides any
 * field tagged badge="advanced"|"research" when showAdvancedTraining is
 * false), so this view shows ~18 fields total — every knob a normal LoRA
 * run actually touches.
 */
export function EssentialsGrid() {
  const showAdvanced = useUIStore((s) => s.showAdvancedTraining);
  const setShowAdvanced = useUIStore((s) => s.setShowAdvancedTraining);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 pt-6 pb-32">
      <div className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Hyperparameters</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The knobs almost every run touches. Flip "Show advanced" to expose
            the full 200-field surface.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/40">
          <span className="text-xs font-medium text-muted-foreground">Show advanced</span>
          <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} />
        </label>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="grid grid-cols-1 gap-5 xl:grid-cols-2"
      >
        <Card title="Model & paths" subtitle="Where things live, what's loaded">
          <BasicSection />
        </Card>
        <Card title="LoRA / network" subtitle="Adapter shape and target modules">
          <LoRASection />
        </Card>
        <Card title="Optimizer" subtitle="LR, scheduler, gradient handling">
          <OptimizerSection />
        </Card>
        <Card title="Schedule & checkpointing" subtitle="How long, how often to save">
          <ScheduleSection />
        </Card>
      </motion.div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card/40">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
