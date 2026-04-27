import type { ReactNode } from "react";
import { ContextPanelProvider } from "./ContextPanelContext";
import { IconRail } from "./IconRail";
import { ContextPanel } from "./ContextPanel";
import { Header } from "./Header";
import { useWebSocketHub } from "@/hooks/useWebSocketHub";

export function Layout({ children }: { children: ReactNode }) {
  // Single hub connection for the entire app. Pushes system info,
  // process status, and metrics into TanStack Query cache.
  useWebSocketHub();

  return (
    <ContextPanelProvider>
      <div className="flex h-full overflow-hidden">
        <IconRail />
        <ContextPanel />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="min-h-0 flex-1 overflow-auto scrollbar-thin bg-background">
            {children}
          </main>
        </div>
      </div>
    </ContextPanelProvider>
  );
}
