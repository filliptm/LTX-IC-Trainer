import { useEffect, useRef, useState } from "react";
import type { ProcessType } from "@/api/processes";

/** Hard cap on the in-memory log buffer per process type. */
const MAX_LINES = 10_000;

type Frame =
  | { type: "history"; lines: string[] }
  | { type: "line"; line: string };

export interface WebSocketLogsState {
  /** Most recent ~10 000 lines. Newest last. */
  lines: string[];
  /** Connection status for UI indicators. */
  status: "connecting" | "open" | "closed" | "error";
}

/**
 * Connects to /ws/processes/{type}/logs and maintains a bounded,
 * newest-last list of log lines.
 *
 * Reconnect strategy: exponential backoff capped at 5s. The hook
 * tears down the socket cleanly on unmount and on type change.
 *
 * The browser's `WebSocket` is used directly instead of a library —
 * the protocol is trivial (one JSON frame per message) and we don't
 * need heartbeats (the server never stops sending history + new
 * lines, and idle sockets are fine for localhost).
 */
export function useWebSocketLogs(type: ProcessType): WebSocketLogsState & {
  clear: () => void;
} {
  const [state, setState] = useState<WebSocketLogsState>({
    lines: [],
    status: "connecting",
  });
  const linesRef = useRef<string[]>([]);
  const reconnectDelayRef = useRef(200);
  const mountedRef = useRef(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    let ws: WebSocket | null = null;

    // Derive ws:// or wss:// from the current page location so this works
    // both in dev (Vite proxy) and prod (served by FastAPI).
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws/processes/${type}/logs`;

    const connect = () => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, status: "connecting" }));
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectDelayRef.current = 200; // reset backoff
        setState((s) => ({ ...s, status: "open" }));
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const frame = JSON.parse(event.data as string) as Frame;
          if (frame.type === "history") {
            linesRef.current = frame.lines.slice(-MAX_LINES);
          } else if (frame.type === "line") {
            linesRef.current.push(frame.line);
            if (linesRef.current.length > MAX_LINES) {
              linesRef.current = linesRef.current.slice(-MAX_LINES);
            }
          }
          setState({ lines: [...linesRef.current], status: "open" });
        } catch {
          // Drop unparseable frames silently.
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setState((s) => ({ ...s, status: "error" }));
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setState((s) => ({ ...s, status: "closed" }));
        // Schedule reconnect with exponential backoff capped at 5s.
        const delay = Math.min(reconnectDelayRef.current, 5000);
        reconnectDelayRef.current = Math.min(delay * 2, 5000);
        timerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch {
          // already closed
        }
      }
    };
  }, [type]);

  const clear = () => {
    linesRef.current = [];
    setState((s) => ({ ...s, lines: [] }));
  };

  return { ...state, clear };
}
