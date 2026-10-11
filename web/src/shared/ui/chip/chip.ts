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
        // The one featured pill of a page (the join hero): tinted gradient, a light sweep and a drifting ring.
        highlight:
          "relative overflow-hidden border border-accent/42 bg-linear-110 from-accent-soft/94 to-surface-1/78 text-accent shadow-lg shadow-accent/10 inset-ring inset-ring-surface-1/55 " +
          "before:pointer-events-none before:absolute before:inset-y-0 before:-left-9/20 before:w-19/50 before:-skew-x-18 before:bg-linear-105 before:from-transparent before:via-surface-1/62 before:to-transparent before:animate-visitor-shimmer before:content-[''] " +
          "after:pointer-events-none after:absolute after:-top-5 after:right-3 after:size-12.75 after:animate-visitor-orbit after:rounded-full after:border after:border-accent/32 after:content-[''] " +
          "motion-reduce:before:animate-none motion-reduce:after:animate-none",
      },
      size: {
        md: "",
        hero: "h-auto min-h-10.5 gap-2.5 py-1.75 pr-3.5 pl-2.25 text-md font-bold tracking-pill",
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
