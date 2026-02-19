import * as React from "react";
import { cn } from "./utils";

// PUBLIC_INTERFACE
export function Card({
  className,
  ...props
}: React.ComponentProps<"div">) {
  /** Card container. */
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-white text-gray-900 flex flex-col gap-6 rounded-xl border border-gray-200",
        className
      )}
      {...props}
    />
  );
}

// PUBLIC_INTERFACE
export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  /** Card header section. */
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6",
        className
      )}
      {...props}
    />
  );
}

// PUBLIC_INTERFACE
export function CardTitle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  /** Card title text wrapper. */
  return (
    <h4
      data-slot="card-title"
      className={cn("leading-none", className)}
      {...props}
    />
  );
}

// PUBLIC_INTERFACE
export function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  /** Card body content. */
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 [&:last-child]:pb-6", className)}
      {...props}
    />
  );
}
