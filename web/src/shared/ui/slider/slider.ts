// Slider parts, on reka-ui. Thumb and track sizes match the previous native
// range input; on mobile the whole control is a 44 px touch target.
export const sliderRootClass =
  "relative flex h-6 w-full min-w-0 cursor-pointer touch-none select-none items-center max-compact:h-11 " +
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

export const sliderTrackClass = "relative h-1 grow overflow-hidden rounded-full bg-line-strong";

export const sliderRangeClass = "absolute h-full rounded-full bg-accent";

export const sliderThumbClass =
  "box-border block size-[18px] rounded-full border-2 border-solid border-accent bg-surface-1 shadow-sm outline-none transition-shadow motion-reduce:transition-none " +
  "max-compact:size-[22px] " +
  "focus-visible:shadow-focus data-[disabled]:pointer-events-none";
