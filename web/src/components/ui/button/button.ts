import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "box-border inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border font-sans font-semibold no-underline " +
    "transition-colors motion-reduce:transition-none " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
    // Toggle state (mute, deafen). The consumer swaps the icon too, so state is not color alone.
    "aria-pressed:border-danger/45 aria-pressed:bg-danger-soft aria-pressed:text-danger",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-accent text-accent-fg hover:bg-accent/90",
        secondary: "border-transparent bg-surface-2 text-fg hover:bg-surface-2/70",
        outline: "border-line-strong bg-transparent text-fg hover:bg-surface-2",
        ghost: "border-transparent bg-transparent text-fg hover:bg-surface-2",
        danger: "border-transparent bg-danger text-surface-1 hover:bg-danger/90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
      // Square button with an icon and no text. Needs an aria-label.
      iconOnly: {
        true: "px-0",
        false: "",
      },
    },
    compoundVariants: [
      { iconOnly: true, size: "sm", class: "w-8" },
      { iconOnly: true, size: "md", class: "w-10" },
      { iconOnly: true, size: "lg", class: "w-12" },
    ],
    defaultVariants: { variant: "primary", size: "md", iconOnly: false },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
