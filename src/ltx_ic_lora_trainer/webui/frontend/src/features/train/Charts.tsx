import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type MetricRow, type RunEvent } from "@/api/metrics";

/** Reservoir-ish downsampling for display: keep at most `max` points. */
function downsample<T>(rows: T[], max = 2000): T[] {
  if (rows.length <= max) return rows;
  const stride = Math.ceil(rows.length / max);
  return rows.filter((_, i) => i % stride === 0);
}

export function LossChart({ rows }: { rows: MetricRow[] }) {
  const data = downsample(rows);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Loss</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="step" fontSize={10} stroke="currentColor" />
              <YAxis fontSize={10} stroke="currentColor" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="loss"
                stroke="var(--chart-1)"
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.5}
                name="loss"
              />
              <Line
                type="monotone"
                dataKey="avr_loss"
                stroke="var(--chart-2)"
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.5}
                name="avg loss"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function LRChart({ rows }: { rows: MetricRow[] }) {
  const data = downsample(rows);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Learning rate</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="step" fontSize={10} stroke="currentColor" />
              <YAxis fontSize={10} stroke="currentColor" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="lr"
                stroke="var(--chart-3)"
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface ValidationPoint {
  step: number;
  loss: number;
}

/**
 * Validation loss over time. Pulled from events.jsonl rather than
 * metrics.jsonl because base_trainer.run_validation logs its results
 * via accelerator.log which is routed through the event stream.
 *
 * The expected event shape is `{type: "validation", step: number, loss: number}`
 * but older runs may use slightly different keys — we accept `val_loss`,
 * `validation_loss`, or any numeric field that isn't `step` / `time` / `type`.
 */
export function ValidationLossChart({ events }: { events: RunEvent[] }) {
  const points: ValidationPoint[] = [];
  for (const e of events) {
    if (e.type !== "validation") continue;
    const step = Number(e.step);
    if (!Number.isFinite(step)) continue;
    let loss: number | null = null;
    const candidates: unknown[] = [e.loss, (e as Record<string, unknown>).val_loss, (e as Record<string, unknown>).validation_loss];
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) {
        loss = c;
        break;
      }
    }
    if (loss === null) continue;
    points.push({ step, loss });
  }
  const data = downsample(points);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Validation loss</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          {points.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No validation events yet. Set <span className="mx-1 font-mono">validate_every_n_steps</span> on the Project tab.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="step" fontSize={10} stroke="currentColor" />
                <YAxis fontSize={10} stroke="currentColor" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="loss"
                  stroke="var(--chart-4)"
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
