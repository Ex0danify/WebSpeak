import { cva, type VariantProps } from "class-variance-authority";

// The overlay is a full-viewport frame that dims the page and centres the
// panel. Legacy page CSS goes up to z-index 40; menus, popovers and tooltips
// (z-50) must open above a dialog, so the overlay sits in between.
export const dialogOverlayClass = "fixed inset-0 z-45 box-border flex items-center justify-center bg-scrim/60 p-4";

export const dialogPanelVariants = cva(
  "flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-line bg-surface-1 font-sans text-sm text-fg shadow-lg",
  {
    variants: {
      size: {
        sm: "max-w-[25rem]",
        md: "max-w-[32rem]",
        // 920 px, the width of the existing settings dialog.
        lg: "max-w-[57.5rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type DialogVariants = VariantProps<typeof dialogPanelVariants>;

// `placement="bottom"` turns the dialog into a mobile sheet: the panel is
// pinned to the bottom edge, full width, with only its top corners rounded.
// These classes are merged after the defaults, so they win on conflict.
export const dialogSheetOverlayClass = "p-0 items-end";
export const dialogSheetPanelClass = "max-w-none rounded-b-none rounded-t-lg border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]";
