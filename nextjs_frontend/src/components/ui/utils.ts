import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// PUBLIC_INTERFACE
export function cn(...inputs: ClassValue[]) {
  /** Merge Tailwind class names safely. */
  return twMerge(clsx(inputs));
}
