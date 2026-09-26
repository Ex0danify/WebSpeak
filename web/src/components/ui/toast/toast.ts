import { cva } from "class-variance-authority";

export const toastRootClass =
  "box-border flex w-full flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-1 px-3.5 py-3 font-sans text-sm text-fg shadow-lg " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const toastViewportClass =
  "fixed bottom-0 right-0 z-[60] m-0 box-border flex w-[26rem] max-w-full list-none flex-col gap-2 p-4 outline-none";

// The round status badge from the mock.
export const toastIconVariants = cva("mt-px inline-flex size-7 shrink-0 items-center justify-center rounded-full", {
  variants: {
    variant: {
      info: "bg-accent-soft text-accent",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-danger-soft text-danger",
    },
  },
  defaultVariants: { variant: "info" },
});
