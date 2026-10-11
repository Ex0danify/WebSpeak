import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Font sizes declared as --text-* in tokens.css; without them twMerge reads `text-ui` as a color.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["2xs", "caption", "ui", "md", "flag", "display", "display-compact"] } },
});

/** Merge class names, letting later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
