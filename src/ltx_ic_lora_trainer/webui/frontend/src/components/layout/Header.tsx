import { Moon, Sun, ChevronRight } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/uiStore";
import { useProject } from "@/api/projects";
import { SystemStrip } from "./SystemStrip";

const PAGE_LABELS: Record<string, string> = {
  "/": "Data",
  "/training": "Train",
};

export function Header() {
  const { theme, toggleTheme } = useUIStore();
  const { data: project } = useProject();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const projectName =
    (project?.config?.name as string | undefined) ?? "No project";
  const pageName = PAGE_LABELS[pathname] ?? "Data";

  return (
    <header className="flex h-10 items-center justify-between gap-4 border-b border-border bg-card px-4">
      <div className="flex items-center gap-1.5 min-w-0 text-xs">
        <span className="truncate max-w-[160px] text-muted-foreground">
          {projectName}
        </span>
        <ChevronRight className="size-3 text-muted-foreground shrink-0" />
        <span className="font-medium shrink-0">{pageName}</span>
      </div>
      <div className="flex items-center gap-4">
        <SystemStrip />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="size-7"
            >
              {theme === "dark" ? (
                <Sun className="size-3.5" />
              ) : (
                <Moon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
