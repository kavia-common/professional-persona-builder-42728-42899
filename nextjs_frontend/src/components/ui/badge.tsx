import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 transition overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[color:var(--primary)] text-white",
        secondary:
          "border-transparent bg-gray-100 text-gray-900",
        destructive:
          "border-transparent bg-[color:var(--destructive)] text-white",
        outline: "text-gray-900"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

// PUBLIC_INTERFACE
export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  /** Badge primitive for small labels/pills. */
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
