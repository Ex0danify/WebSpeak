import { cva, type VariantProps } from "class-variance-authority";

export const cardVariants = cva(
  "box-border flex min-w-0 flex-col rounded-lg border border-line bg-surface-1 font-sans text-sm/[normal] text-fg",
  {
    variants: {
      // A floating card (a login box) rather than a surface in the page.
      raised: { true: "shadow-lg", false: "" },
    },
    defaultVariants: { raised: false },
  },
);

export const cardBodyVariants = cva("min-w-0 flex-1", {
  variants: {
    padding: {
      none: "",
      dense: "px-4 py-3.5",
      sm: "p-4",
      md: "p-5",
      lg: "p-5.5 max-narrow:p-4.5",
      xl: "p-9 max-narrow:px-5 max-narrow:py-6.25",
    },
  },
  defaultVariants: { padding: "md" },
});

export type CardVariants = VariantProps<typeof cardVariants> & VariantProps<typeof cardBodyVariants>;
