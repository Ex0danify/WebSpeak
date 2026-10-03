import { cva, type VariantProps } from "class-variance-authority";

// The speaking ring is a box-shadow, so it takes no layout space: leave 4 px
// around a speaking avatar. The 2 px gap is painted in `--avatar-gap`, which
// `surface` sets to the color of whatever the avatar sits on.
export const avatarVariants = cva(
  "relative box-border inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-surface-2 font-sans font-semibold leading-none text-fg",
  {
    variants: {
      size: {
        xs: "size-5 text-[10px]",
        sm: "size-6 text-[11px]",
        md: "size-8 text-xs",
        lg: "size-10 text-sm",
        xl: "size-14 text-lg",
      },
      surface: {
        "surface-0": "[--avatar-gap:var(--color-surface-0)]",
        "surface-1": "[--avatar-gap:var(--color-surface-1)]",
        "surface-2": "[--avatar-gap:var(--color-surface-2)]",
      },
      speaking: {
        true: "shadow-[0_0_0_2px_var(--avatar-gap),0_0_0_4px_var(--color-success)]",
        false: "",
      },
    },
    defaultVariants: { size: "sm", surface: "surface-1", speaking: false },
  },
);

export type AvatarVariants = VariantProps<typeof avatarVariants>;
