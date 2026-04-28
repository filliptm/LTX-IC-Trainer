import { Link, useRouterState } from "@tanstack/react-router";
import { Database, GraduationCap } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Projects", icon: Database },
  { to: "/training", label: "Train", icon: GraduationCap },
] as const;

export function IconRail() {
  const location = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-card">
      {/* Brand — matches Header height (h-10) */}
      <div className="flex h-10 w-full items-center justify-center border-b border-border">
        <span className="text-xs font-bold tracking-tight select-none">LTX</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 py-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.to === "/"
              ? location === "/"
              : location.startsWith(item.to);

          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  aria-label={item.label}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground hover:scale-105",
                    isActive && "bg-muted text-foreground"
                  )}
                >
                  <Icon className="size-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
