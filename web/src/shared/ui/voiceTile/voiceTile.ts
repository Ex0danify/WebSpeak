import { cva, type VariantProps } from "class-variance-authority";

// A member tile in the voice grid: avatar, name and status in a centered card that lights up while
// the member speaks. A tile is not a content `Card` (no header, body or footer), hence its own look.
export const voiceTileVariants = cva(
  "min-h-38 rounded-lg border bg-surface-1 px-2.75 pt-4.25 pb-3.25 text-center shadow-sm transition duration-180 hover:-translate-y-0.5 motion-reduce:transition-none " +
    "max-compact:relative max-compact:min-h-34 max-compact:px-2 max-compact:pt-4.5 max-compact:pb-3.5",
  {
    variants: {
      speaking: {
        true: "border-success ring-2 ring-success/30",
        false: "border-line",
      },
    },
    defaultVariants: { speaking: false },
  },
);

export type VoiceTileVariants = VariantProps<typeof voiceTileVariants>;

// Name and status lines of a tile: block, one line, ellipsis.
export const voiceTileNameClass = "block truncate text-md text-fg max-compact:max-w-full max-compact:text-sm";

export const voiceTileStatusVariants = cva("mt-1.25 block truncate text-ui max-compact:mt-1 max-compact:text-caption", {
  variants: { speaking: { true: "text-success", false: "text-fg-muted" } },
  defaultVariants: { speaking: false },
});
