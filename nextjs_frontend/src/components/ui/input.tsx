import * as React from "react";
import { cn } from "./utils";

// PUBLIC_INTERFACE
export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  /** Input primitive for forms. */
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border border-gray-200 flex h-10 w-full rounded-md bg-[color:var(--input-background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
