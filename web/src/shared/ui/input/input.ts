import { cva, type VariantProps } from "class-variance-authority";

/** Shared look of text-like controls (Input and Select). */
export const controlVariants = cva(
  "box-border block h-10 w-full min-w-0 rounded-md border bg-surface-1 px-3 font-sans text-sm text-fg " +
    "max-compact:h-11 " +
    "placeholder:text-fg-muted transition-colors motion-reduce:transition-none " +
    "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "focus-visible:ring-2 focus-visible:ring-accent/26 " +
    "disabled:cursor-not-allowed disabled:opacity-50 " +
    "aria-[invalid=true]:border-danger",
  {
    variants: {
      invalid: {
        true: "border-danger",
        false: "border-line-strong",
      },
    },
    defaultVariants: { invalid: false },
  },
);

export type ControlVariants = VariantProps<typeof controlVariants>;
