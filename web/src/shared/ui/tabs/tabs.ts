import { cva } from "class-variance-authority";

export const tabListVariants = cva("flex max-w-full", {
  variants: {
    variant: {
      // Scrolls sideways instead of wrapping when German or Russian labels do not fit.
      underline: "gap-1 overflow-x-auto border-b border-line",
      segmented: "inline-flex gap-0.5 overflow-x-auto rounded-md bg-surface-2 p-0.5",
      // Separate bordered chips with an icon and a label (the chat tabs). On a phone the list is a
      // bar with a rule under it and no scrollbar.
      // Bottom navigation bar: equal columns, no track.
      bar: "grid flex-1 grid-cols-4 gap-0.5",
      pills:
        "items-center gap-1.5 overflow-x-auto pb-0.75 max-compact:flex-none max-compact:border-b max-compact:border-line max-compact:pt-2.5 max-compact:pb-2.25 max-compact:[scrollbar-width:none] max-compact:[&::-webkit-scrollbar]:hidden",
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
    "disabled:pointer-events-none disabled:opacity-50 max-compact:h-11",
  {
    variants: {
      variant: {
        underline:
          "h-10 px-3.5 text-sm hover:text-fg aria-selected:text-fg " +
          "aria-selected:after:absolute aria-selected:after:inset-x-2.5 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:rounded-sm aria-selected:after:bg-accent aria-selected:after:content-['']",
        segmented:
          "h-7 rounded-sm px-3 text-ui hover:text-fg aria-selected:bg-surface-1 aria-selected:text-fg aria-selected:shadow-sm aria-checked:bg-surface-1 aria-checked:text-fg aria-checked:shadow-sm",
        bar: "h-auto min-h-13 flex-col justify-start gap-3 rounded-lg px-1 pt-1.375 text-xs font-normal max-compact:h-auto aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent",
        pills:
          "gap-1.25 rounded-sm border border-transparent bg-surface-0 px-2.5 py-1.75 text-caption font-normal hover:bg-surface-2 hover:text-accent " +
          "aria-selected:border-line aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent",
      },
    },
    defaultVariants: { variant: "underline" },
  },
);
