import { useProcessCommandPreview, type ProcessType } from "@/api/processes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export function CommandPreview({ type }: { type: ProcessType }) {
  const { data, error } = useProcessCommandPreview(type);
  // Backend returns {command: "..."} as a single space-joined string
  // (see routes/processes.py get_command_preview).
  const commandString = data?.command ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commandString);
      toast.success("Copied");
    } catch {
      toast.error("Clipboard not available");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">Command preview</CardTitle>
        <Button variant="ghost" size="icon" onClick={copy} disabled={!commandString}>
          <Copy className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-xs text-destructive">{String(error)}</div>
        ) : commandString ? (
          <pre className="max-h-40 overflow-auto scrollbar-thin rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {commandString}
          </pre>
        ) : (
          <div className="text-xs text-muted-foreground">No command available (load a project).</div>
        )}
      </CardContent>
    </Card>
  );
}
