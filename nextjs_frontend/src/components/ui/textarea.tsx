import * as React from "react";
import { cn } from "./utils";

// PUBLIC_INTERFACE
export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  /** Textarea primitive for longer text entry. */
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border border-gray-200 min-h-16 w-full rounded-md bg-[color:var(--input-background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
