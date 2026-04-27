import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProcessType } from "@/api/processes";

interface LogsResponse {
  lines: string[];
}

export function ProcessConsole({ type }: { type: ProcessType }) {
  const { data } = useQuery<LogsResponse>({
    queryKey: ["processes", type, "logs"],
    queryFn: () => api.get<LogsResponse>(`/api/processes/${type}/logs`),
    refetchInterval: 1500,
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [data?.lines.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Logs</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={ref}
          className="h-64 overflow-y-auto scrollbar-thin rounded-md border bg-black/90 p-3 font-mono text-xs text-green-200"
        >
          {data?.lines && data.lines.length > 0 ? (
            data.lines.map((line, i) => <div key={i}>{line}</div>)
          ) : (
            <div className="text-muted-foreground">No output yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
