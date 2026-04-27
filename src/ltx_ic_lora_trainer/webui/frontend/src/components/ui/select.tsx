import * as React from "react";
import { cn } from "@/lib/utils";

// A simple native <select> wrapped in our design tokens. Good enough for
// dropdowns that don't need search; use Combobox for searchable lists.
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 [&_option]:bg-card [&_option]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
