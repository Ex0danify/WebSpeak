import { cva } from "class-variance-authority";

export const tabListVariants = cva("flex max-w-full", {
  variants: {
    variant: {
      // Scrolls sideways instead of wrapping when German or Russian labels do not fit.
      underline: "gap-1 overflow-x-auto border-b border-line",
      segmented: "inline-flex gap-0.5 overflow-x-auto rounded-md bg-surface-2 p-0.5",
    },
    fill: { true: "w-full", false: "" },
  },
  compoundVariants: [{ variant: "segmented", fill: true, class: "flex [&>[data-tab-item]]:grow" }],
  defaultVariants: { variant: "underline", fill: false },
});

export const tabItemVariants = cva(
  "relative box-border inline-flex min-w-0 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap border-0 bg-transparent font-sans font-medium text-fg-muted " +
    "transition-colors motion-reduce:transition-none " +
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent " +
    "disabled:pointer-events-none disabled:opacity-50 max-[740px]:h-11",
  {
    variants: {
      variant: {
        underline:
          "h-10 px-3.5 text-sm hover:text-fg aria-selected:text-fg " +
          "aria-selected:after:absolute aria-selected:after:inset-x-2.5 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:rounded-sm aria-selected:after:bg-accent aria-selected:after:content-['']",
        segmented:
          "h-7 rounded-[calc(var(--radius-md)-2px)] px-3 text-[13px] hover:text-fg aria-selected:bg-surface-1 aria-selected:text-fg aria-selected:shadow-sm aria-checked:bg-surface-1 aria-checked:text-fg aria-checked:shadow-sm",
      },
    },
    defaultVariants: { variant: "underline" },
  },
);
