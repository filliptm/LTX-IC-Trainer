import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCaptionContent, useSaveCaption } from "@/api/captions";
import { MediaPreview } from "./MediaPreview";

interface CaptionEditorProps {
  /** Full path to the caption file (e.g. D:/datasets/hero/clip_001.txt) */
  captionPath: string;
  /** Media URL for the preview player */
  mediaSrc: string;
  /** Asset type for choosing the right player */
  mediaType: "video" | "image" | "audio";
  /** Asset filename for display */
  filename: string;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Main-canvas content for the Captions page.
 * Media preview at the top, editable textarea below with save + navigation.
 */
export function CaptionEditor({
  captionPath,
  mediaSrc,
  mediaType,
  filename,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: CaptionEditorProps) {
  const { data: captionData } = useCaptionContent(captionPath);
  const saveMutation = useSaveCaption();
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync from server when caption data arrives or captionPath changes.
  useEffect(() => {
    if (captionData !== undefined) {
      setText(captionData.content);
      setDirty(false);
    }
  }, [captionData, captionPath]);

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({ path: captionPath, content: text });
      setDirty(false);
      toast.success("Caption saved");
    } catch {
      toast.error("Failed to save caption");
    }
  };

  // Ctrl+S shortcut.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="space-y-4">
      {/* Navigation header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label="previous asset"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium truncate max-w-[300px]">
            {filename}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="next asset"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
        >
          <Save className="size-3.5 mr-1" />
          Save
        </Button>
      </div>

      {/* Media preview */}
      <MediaPreview src={mediaSrc} type={mediaType} />

      {/* Caption textarea */}
      <div className="space-y-1">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          onBlur={() => {
            if (dirty) void handleSave();
          }}
          placeholder="Describe the asset…"
          rows={6}
          className="text-sm"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {text.length} chars{dirty ? " · unsaved" : ""}
          </span>
          <span>Ctrl+S to save</span>
        </div>
      </div>
    </div>
  );
}
