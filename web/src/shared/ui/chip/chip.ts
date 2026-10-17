import { cva, type VariantProps } from "class-variance-authority";

export const chipVariants = cva(
  "box-border inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-0 px-2.5 font-sans text-xs font-medium leading-none",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-fg",
        accent: "bg-accent-soft text-accent",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
      },
      size: {
        md: "",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export type ChipVariants = VariantProps<typeof chipVariants>;

export const countVariants = cva(
  "box-border inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-sans text-caption font-semibold leading-none tabular-nums",
  {
    variants: {
      variant: {
        accent: "bg-accent text-accent-fg",
        neutral: "bg-surface-2 text-fg-muted",
        danger: "bg-danger text-surface-1",
      },
    },
    defaultVariants: { variant: "accent" },
  },
);

export type CountVariants = VariantProps<typeof countVariants>;
