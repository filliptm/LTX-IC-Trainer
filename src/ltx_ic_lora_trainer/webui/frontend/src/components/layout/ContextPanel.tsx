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

  if (!content) return null;

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-card/60">
      <AnimatePresence mode="wait">
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
