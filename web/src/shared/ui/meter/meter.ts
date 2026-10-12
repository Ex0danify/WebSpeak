import { cva, type VariantProps } from "class-variance-authority";

// The track clips the fill, a full-width gradient that `clip-path` cuts to --level (0 to 1). The gradient is anchored to the
// track, so the same level always shows the same colors, and moving it only changes a paint property (no layout, no transition
// to fight).
export const meterVariants = cva("relative block w-full min-w-0 overflow-hidden rounded-full bg-surface-2", {
  variants: {
    size: {
      sm: "h-1.5",
      md: "h-2",
    },
  },
  defaultVariants: { size: "md" },
});

export type MeterVariants = VariantProps<typeof meterVariants>;

export const meterFillClass =
  "absolute inset-0 rounded-full bg-[linear-gradient(90deg,var(--color-success)_0_70%,var(--color-warning)_92%)] [clip-path:inset(0_calc((1-var(--level,0))*100%)_0_0)]";

// A thin tick, for example the VOX threshold. It is a shape as well as a
// color, so the position reads without telling hues apart.
export const meterThresholdClass = "absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg [left:calc(var(--threshold)*100%)]";
