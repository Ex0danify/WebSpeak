import { cva, type VariantProps } from "class-variance-authority";

/** Shared look of text-like controls (Input now, Select in step 4.3). */
export const controlVariants = cva(
  "box-border block h-10 w-full min-w-0 rounded-md border bg-surface-1 px-3 font-sans text-sm text-fg " +
    "max-[740px]:h-11 " +
    "placeholder:text-fg-muted transition-colors motion-reduce:transition-none " +
    "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ws-accent)_26%,transparent)] " +
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
