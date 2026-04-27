import type { ReactNode } from "react";

/**
 * Body container for an accordion section. Wraps the form fields in a
 * tight vertical stack with a subtle divider between groups (if any).
 */
export function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-3 py-1">{children}</div>;
}

/**
 * Visual sub-group within a section (e.g. a single research feature's
 * nested fields under its master toggle). Optional `id` lets the sidebar
 * anchor-scroll directly to a sub-section.
 */
export function SubGroup({
  title,
  id,
  children,
}: {
  title?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id ? `section-${id}` : undefined}
      className="ml-2 space-y-3 border-l border-border/60 pl-4 scroll-mt-6"
    >
      {title && <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>}
      {children}
    </div>
  );
}
