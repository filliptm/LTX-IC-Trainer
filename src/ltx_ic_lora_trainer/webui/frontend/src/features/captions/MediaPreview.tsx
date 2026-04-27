/**
 * Renders the appropriate player based on file type:
 * - video → <video controls>
 * - image → <img>
 * - audio → <audio controls>
 */
export function MediaPreview({
  src,
  type,
}: {
  src: string;
  type: "video" | "image" | "audio";
}) {
  if (type === "video") {
    return (
      <video
        key={src}
        controls
        className="w-full rounded-lg bg-black"
        preload="metadata"
      >
        <source src={src} />
      </video>
    );
  }

  if (type === "image") {
    return (
      <img
        src={src}
        alt=""
        className="w-full rounded-lg bg-muted object-contain"
      />
    );
  }

  // audio
  return (
    <div className="flex items-center justify-center rounded-lg bg-muted p-8">
      <audio key={src} controls preload="metadata" className="w-full max-w-lg">
        <source src={src} />
      </audio>
    </div>
  );
}
