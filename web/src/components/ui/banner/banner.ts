import { cva, type VariantProps } from "class-variance-authority";

export const bannerVariants = cva(
  "box-border flex w-full flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border px-4 py-3 font-sans text-sm text-fg",
  {
    variants: {
      variant: {
        info: "border-accent/30 bg-accent-soft",
        warning: "border-warning/30 bg-warning-soft",
        danger: "border-danger/30 bg-danger-soft",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export type BannerVariants = VariantProps<typeof bannerVariants>;
