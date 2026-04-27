import { useEffect, useState, Fragment } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SectionNavItem {
  id: string;
  label: string;
  /** Optional parent label — when set, renders a non-clickable header above this item. */
  parentLabel?: string;
  /** Optional indicator (e.g. "off" / count of enabled features) shown to the right. */
  hint?: string;
  /** If set, renders an on/off dot (green when on, dim when off). */
  isOn?: boolean | null;
}

export interface SectionNavGroup {
  title: string;
  items: SectionNavItem[];
}

interface HyperparameterSidebarProps {
  groups: SectionNavGroup[];
  /** Currently active tab id. */
  activeId: string | null;
  /** Current search query (for filtering field results). */
  searchQuery: string;
  onSearchChange: (q: string) => void;
  /** Search results — when non-empty, render these instead of the section nav. */
  searchResults?: { id: string; label: string; sectionId: string; sectionLabel: string }[];
  onResultClick: (sectionId: string, fieldId?: string) => void;
}

/**
 * Left-side tab navigator for the hyperparameter editor. Each leaf item
 * is a tab — clicking it swaps the main content area. Non-clickable
 * parentLabel headers group related items (e.g. Memory & VRAM + Quantization
 * + Attention + torch.compile are all under "Memory & performance").
 */
export function HyperparameterSidebar({
  groups,
  activeId,
  searchQuery,
  onSearchChange,
  searchResults,
  onResultClick,
}: HyperparameterSidebarProps) {
  const isSearching = searchQuery.trim().length > 0;
  const showResults = isSearching && searchResults && searchResults.length > 0;
  const noResults = isSearching && (!searchResults || searchResults.length === 0);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex h-10 shrink-0 items-center justify-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sections
        </span>
      </div>

      {/* Search */}
      <div className="border-b border-border p-2">
        <SearchInput value={searchQuery} onChange={onSearchChange} />
      </div>

      <nav className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {showResults ? (
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {searchResults!.length} match{searchResults!.length === 1 ? "" : "es"}
            </div>
            {searchResults!.map((r) => (
              <button
                key={`${r.sectionId}-${r.id}`}
                onClick={() => onResultClick(r.sectionId, r.id)}
                className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/60"
              >
                <span className="truncate">{r.label}</span>
                <span className="text-[10px] text-muted-foreground">{r.sectionLabel}</span>
              </button>
            ))}
          </div>
        ) : noResults ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No matches
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <GroupList
                key={group.title}
                group={group}
                activeId={activeId}
                onClick={onResultClick}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-border p-2">
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
          Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">/</kbd> to search
        </div>
      </div>
    </aside>
  );
}

/**
 * Render one "Essentials" / "Advanced" / "Research" group. Walks the items
 * in order; whenever the parentLabel changes, emits a non-clickable parent
 * header above the subsequent items (which get indented + left border).
 */
function GroupList({
  group,
  activeId,
  onClick,
}: {
  group: SectionNavGroup;
  activeId: string | null;
  onClick: (id: string) => void;
}) {
  // Build groups of items by parentLabel (preserving order)
  const chunks: { parentLabel?: string; items: SectionNavItem[] }[] = [];
  for (const item of group.items) {
    const last = chunks[chunks.length - 1];
    if (last && last.parentLabel === item.parentLabel) {
      last.items.push(item);
    } else {
      chunks.push({ parentLabel: item.parentLabel, items: [item] });
    }
  }

  return (
    <div>
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {group.title}
      </div>
      <div className="space-y-0.5">
        {chunks.map((chunk, ci) => (
          <Fragment key={ci}>
            {chunk.parentLabel ? (
              <div>
                <div className="mt-2 px-2 pb-0.5 text-[11px] font-medium text-muted-foreground/80">
                  {chunk.parentLabel}
                </div>
                <div className="ml-2 space-y-0.5 border-l border-border/60 pl-2">
                  {chunk.items.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={item.id === activeId}
                      onClick={() => onClick(item.id)}
                      small
                    />
                  ))}
                </div>
              </div>
            ) : (
              chunk.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={item.id === activeId}
                  onClick={() => onClick(item.id)}
                />
              ))
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function NavItem({
  item,
  isActive,
  onClick,
  small,
}: {
  item: SectionNavItem;
  isActive: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded text-left transition-colors",
        small ? "px-2 py-1 text-[11px]" : "px-2 py-1.5 text-xs",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {item.isOn !== undefined && item.isOn !== null && (
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              item.isOn
                ? "bg-[hsl(var(--status-success))]"
                : "bg-muted-foreground/30",
            )}
          />
        )}
        <span className="truncate">{item.label}</span>
      </span>
      {item.hint && (
        <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{item.hint}</span>
      )}
    </button>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [el, setEl] = useState<HTMLInputElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      el?.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [el]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={setEl}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search fields..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">Press / to focus</TooltipContent>
    </Tooltip>
  );
}
