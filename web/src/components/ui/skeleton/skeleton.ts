import { cva, type VariantProps } from "class-variance-authority";

export const skeletonVariants = cva("block shrink-0 bg-surface-2 animate-pulse motion-reduce:animate-none", {
  variants: {
    shape: {
      // A line of text: give it a width, the height follows the type scale.
      text: "h-3.5 w-full rounded-sm",
      // A block such as a card or image: give it a size.
      rect: "rounded-md",
      // An avatar: give it a size (`size-8`).
      circle: "rounded-full",
    },
  },
  defaultVariants: { shape: "rect" },
});

export type SkeletonVariants = VariantProps<typeof skeletonVariants>;
