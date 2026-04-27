import { useEffect, useRef, useState } from "react";
import { ArrowDown, Wifi, WifiOff, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWebSocketLogs } from "@/hooks/useWebSocketLogs";
import type { ProcessType } from "@/api/processes";

/** Strip common ANSI escape sequences and collapse CR to LF. */
function cleanLine(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const withoutAnsi = raw.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, "");
  // tqdm lines use \r to rewrite in-place on a tty — convert to newlines
  // so we see a stream of progress instead of a frozen line.
  return withoutAnsi.replace(/\r/g, "\n");
}

/**
 * Live terminal-style log viewer backed by the /ws/processes/{type}/logs
 * WebSocket. Auto-scrolls to the bottom on new lines unless the user has
 * scrolled up, in which case a "Jump to bottom" pill appears.
 *
 * When `fillHeight` is true, the terminal expands to fill its parent
 * (which must be a flex column with min-h-0 on its parent chain). When
 * false (default), it uses a fixed h-96 height.
 */
export function Terminal({ type, fillHeight = false }: { type: ProcessType; fillHeight?: boolean }) {
  const { lines, status, clear } = useWebSocketLogs(type);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Track user scroll position to decide whether to stick to the bottom.
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 60);
  };

  useEffect(() => {
    if (!autoScroll) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  const jumpToBottom = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
  };

  const displayedLines = lines.map(cleanLine).join("").split("\n");

  return (
    <div
      className={cn(
        "relative rounded-md border text-xs flex flex-col min-h-0",
        fillHeight ? "h-full" : "",
      )}
      style={{ backgroundColor: "hsl(var(--terminal-bg))", borderColor: "hsl(var(--terminal-border))" }}
    >
      <div className="shrink-0 flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid hsl(var(--terminal-border))" }}>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="font-mono text-[11px]" style={{ color: "hsl(var(--terminal-muted))" }}>terminal</span>
          <Badge variant="outline" className="h-5 font-mono text-[10px]" style={{ borderColor: "hsl(var(--terminal-border))", color: "hsl(var(--terminal-muted))" }}>
            {lines.length} lines
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            className="h-7 text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          "scrollbar-thin overflow-y-auto p-3 font-mono leading-relaxed",
          fillHeight ? "min-h-0 flex-1" : "h-96",
        )}
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "hsl(var(--terminal-text))" }}
      >
        {displayedLines.length === 0 || (displayedLines.length === 1 && displayedLines[0] === "") ? (
          <div style={{ color: "hsl(var(--terminal-muted))" }}>No output yet. Start training to see live logs.</div>
        ) : (
          displayedLines.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
      <AnimatePresence>
        {!autoScroll && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-4 right-4"
          >
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={jumpToBottom}
              className="h-8 rounded-full shadow-lg"
            >
              <ArrowDown className="h-3 w-3" /> Jump to bottom
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusDot({ status }: { status: "connecting" | "open" | "closed" | "error" }) {
  if (status === "open") {
    return <Wifi className="h-3 w-3 text-emerald-400" aria-label="connected" />;
  }
  if (status === "connecting") {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="connecting" />;
  }
  return (
    <WifiOff
      className={cn(
        "h-3 w-3",
        status === "error" ? "text-red-400" : "text-muted-foreground",
      )}
      aria-label={status}
    />
  );
}
