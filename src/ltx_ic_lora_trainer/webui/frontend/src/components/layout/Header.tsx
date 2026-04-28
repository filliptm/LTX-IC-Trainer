import { Moon, Sun, ChevronRight } from "lucide-react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/uiStore";
import { useProject, useCloseProject } from "@/api/projects";
import { SystemStrip } from "./SystemStrip";

const PAGE_LABELS: Record<string, string> = {
  "/": "Projects",
  "/training": "Train",
};

export function Header() {
  const { theme, toggleTheme } = useUIStore();
  const { data: project } = useProject();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const closeProject = useCloseProject();
  const navigate = useNavigate();

  const projectName =
    (project?.config?.name as string | undefined) ?? "No project";
  const pageName = PAGE_LABELS[pathname] ?? "Projects";
  const isLoaded = project?.loaded ?? false;

  // Clicking the project name in the breadcrumb closes the loaded project
  // and routes back to the Data page so the user sees the project tile grid.
  // No dropdown — one click, you're back at the picker.
  const handleProjectClick = async () => {
    if (!isLoaded) {
      navigate({ to: "/" });
      return;
    }
    try {
      await closeProject.mutateAsync();
      navigate({ to: "/" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to close project");
    }
  };

  return (
    <header className="flex h-10 items-center justify-between gap-4 border-b border-border bg-card px-4">
      <div className="flex items-center gap-1.5 min-w-0 text-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleProjectClick}
              disabled={closeProject.isPending}
              className="truncate max-w-[200px] rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label={isLoaded ? "Close project and return to Projects" : "Go to Projects"}
            >
              <span className="truncate">{projectName}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isLoaded ? "Close project & back to Projects" : "Back to Projects"}
          </TooltipContent>
        </Tooltip>
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
