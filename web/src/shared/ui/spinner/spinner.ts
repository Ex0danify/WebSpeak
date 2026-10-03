import { cva, type VariantProps } from "class-variance-authority";

export const spinnerVariants = cva("shrink-0 animate-spin motion-reduce:animate-none", {
  variants: {
    size: {
      sm: "size-3.5",
      md: "size-4",
      lg: "size-6",
    },
  },
  defaultVariants: { size: "md" },
});

export type SpinnerVariants = VariantProps<typeof spinnerVariants>;
