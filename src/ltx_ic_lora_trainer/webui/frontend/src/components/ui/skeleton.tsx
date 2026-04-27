import { cn } from "@/lib/utils";

/**
 * Shimmering placeholder skeleton for loading states.
 * Uses a gradient sweep animation defined in globals.css.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-shimmer rounded-md", className)}
      {...props}
    />
  );
}
