import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Multiplexed WebSocket hub hook.
 *
 * Connects to `/ws/hub`, subscribes to the requested channels, and
 * pushes incoming data directly into TanStack Query's cache so existing
 * hooks (`useSystemInfo`, `useProcessStatus`, `useMetrics`) get updated
 * without HTTP polling.
 *
 * Protocol:
 *   Client → {"subscribe": ["system", "process_status", "metrics"]}
 *   Server → {"channel": "system", "data": {...}}
 *   Server → {"channel": "process_status", "data": {...}}
 *   Server → {"channel": "metrics", "data": {step, loss, ...}}
 *
 * Uses the same reconnect strategy as `useWebSocketLogs`: exponential
 * backoff capped at 5 s. One socket per app — shared across pages via
 * TanStack Query cache side-effects.
 */

type HubStatus = "connecting" | "open" | "closed" | "error";

const CHANNELS = ["system", "process_status", "metrics"] as const;

export function useWebSocketHub(): { status: HubStatus } {
  const [status, setStatus] = useState<HubStatus>("connecting");
  const reconnectDelay = useRef(200);
  const mounted = useRef(true);
  const timer = useRef<number | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    mounted.current = true;
    let ws: WebSocket | null = null;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/hub`;

    const connect = () => {
      if (!mounted.current) return;
      setStatus("connecting");
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (!mounted.current) return;
        reconnectDelay.current = 200;
        setStatus("open");
        // Subscribe to all channels.
        ws!.send(JSON.stringify({ subscribe: [...CHANNELS] }));
      };

      ws.onmessage = (event) => {
        if (!mounted.current) return;
        try {
          const frame = JSON.parse(event.data as string) as {
            channel?: string;
            data?: unknown;
            type?: string;
          };
          if (frame.type === "subscribed") return;

          const { channel, data } = frame;
          if (!channel || data === undefined) return;

          if (channel === "system") {
            qc.setQueryData(["system", "info"], data);
          } else if (channel === "process_status") {
            // data is Record<proc_type, {state, exit_code}>
            const statuses = data as Record<string, unknown>;
            for (const [pt, s] of Object.entries(statuses)) {
              qc.setQueryData(["processes", pt, "status"], s);
            }
          } else if (channel === "metrics") {
            // data is a single metric row — append to the default cached rows.
            qc.setQueryData(
              ["metrics", "rows", 0],
              (old: { rows: unknown[] } | undefined) => {
                const rows = old?.rows ?? [];
                return { rows: [...rows, data] };
              }
            );
          }
        } catch {
          // Drop unparseable frames.
        }
      };

      ws.onerror = () => {
        if (!mounted.current) return;
        setStatus("error");
      };

      ws.onclose = () => {
        if (!mounted.current) return;
        setStatus("closed");
        const delay = Math.min(reconnectDelay.current, 5000);
        reconnectDelay.current = Math.min(delay * 2, 5000);
        timer.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      mounted.current = false;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch {
          // already closed
        }
      }
    };
  }, [qc]);

  return { status };
}
