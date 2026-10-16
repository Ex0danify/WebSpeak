import { cva, type VariantProps } from "class-variance-authority";

// The speaking ring is a box-shadow, so it takes no layout space: leave 4 px
// around a speaking avatar. The 2 px gap is painted in `--avatar-gap`, which
// `surface` sets to the color of whatever the avatar sits on.
export const avatarVariants = cva(
  "relative box-border inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-surface-2 font-sans font-semibold leading-none text-fg",
  {
    variants: {
      size: {
        xs: "size-5 text-2xs",
        sm: "size-6 text-caption",
        md: "size-8 text-xs",
        lg: "size-10 text-sm",
        xl: "size-14 text-lg",
        // Member list rows (row, member), chat message, voice tile and screen-share viewer: sizes that grow on touch screens.
        row: "size-8.25 text-2xs max-compact:size-10 max-compact:text-xs",
        member: "size-7 text-2xs max-compact:size-9 max-compact:text-xs",
        message: "size-8 text-caption max-compact:size-9",
        tile: "size-17 text-xl font-bold max-compact:size-15 max-compact:text-lg",
        viewer: "size-6.25 text-2xs font-extrabold",
      },
      // Paint the fallback with the member's color (see `tint` on Avatar) and light text on it.
      tint: {
        true: "text-accent-fg",
        false: "",
      },
      // Overlapping avatars on the dark media surface: a ring in its color separates neighbours.
      stack: {
        true: "-ml-1 border-2 border-media-raised text-media-fg shadow-sm",
        false: "",
      },
      surface: {
        "surface-0": "[--avatar-gap:var(--color-surface-0)]",
        "surface-1": "[--avatar-gap:var(--color-surface-1)]",
        "surface-2": "[--avatar-gap:var(--color-surface-2)]",
      },
      speaking: {
        true: "shadow-speaking",
        false: "",
      },
    },
    defaultVariants: { size: "sm", surface: "surface-1", speaking: false, tint: false, stack: false },
  },
);

export type AvatarVariants = VariantProps<typeof avatarVariants>;
