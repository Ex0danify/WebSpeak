import { cva, type VariantProps } from "class-variance-authority";

// Menu surface, a 232 px card with 6 px padding and the large shadow.
export const menuContentClass =
  "z-50 box-border flex min-w-56 max-w-[min(20rem,calc(100vw-1rem))] flex-col rounded-lg border border-line bg-surface-1 p-1.5 font-sans text-sm text-fg shadow-lg outline-none " +
  "max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto";

export const menuItemVariants = cva(
  "relative flex h-[34px] w-full cursor-pointer select-none items-center gap-2.5 rounded-sm border-0 bg-transparent px-2.5 text-left font-sans text-sm outline-none " +
    "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
    // Reka focuses the highlighted item, the fill is not enough on its own for keyboard users.
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-compact:h-11",
  {
    variants: {
      // The choice that is in effect in a list of options.
      current: {
        true: "bg-surface-0 text-accent [&_.ui-icon]:text-accent",
        false: "",
      },
      tone: {
        default: "text-fg [&_.ui-icon]:text-fg-muted",
        danger: "text-danger [&_.ui-icon]:text-danger",
      },
    },
    defaultVariants: { tone: "default", current: false },
  },
);

export type MenuItemVariants = VariantProps<typeof menuItemVariants>;

export const menuSeparatorClass = "-mx-1.5 my-1.5 h-px shrink-0 bg-line";
export const menuLabelClass = "px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted";
// The label as a title (a member name) instead of a small-caps heading.
export const menuLabelPlainClass = "normal-case tracking-normal text-fg";

// Sheet mode (740 px and below): the same items as plain buttons, sized for
// touch. There is no highlight state, so the pressed fill stands in for it.
export const menuSheetItemClass = "text-base hover:bg-surface-2 active:bg-surface-2";
