import { AnimatePresence, motion } from "motion/react";
import { useContextPanelContent } from "./ContextPanelContext";

/**
 * 224px-wide contextual detail panel.
 *
 * Content is provided by each route via `useSetContextPanel(...)`.
 * The panel scrolls independently and fades content on route transitions.
 */
export function ContextPanel() {
  const content = useContextPanelContent();

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-card/60">
      <AnimatePresence mode="wait">
        <motion.div
          key={content ? "content" : "placeholder"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {content ?? (
            <div className="p-4 text-xs text-muted-foreground">Loading…</div>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
