// Slider parts, on reka-ui. On mobile the whole control is a 44 px touch target.
export const sliderRootClass =
  "relative flex h-6 w-full min-w-0 cursor-pointer touch-none select-none items-center max-compact:h-11 " +
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

export const sliderTrackClass = "relative h-1 grow overflow-hidden rounded-full bg-line-strong";

export const sliderRangeClass = "absolute h-full rounded-full bg-accent";

export const sliderThumbClass =
  "box-border block size-[18px] rounded-full border-2 border-solid border-accent bg-surface-1 shadow-sm outline-none transition-shadow motion-reduce:transition-none " +
  "max-compact:size-[22px] " +
  // On a phone or a touch screen the thumb keeps its size and a 44 px area around it takes the tap.
  "max-compact:after:absolute max-compact:after:top-1/2 max-compact:after:left-1/2 max-compact:after:size-11 max-compact:after:-translate-1/2 max-compact:after:content-[''] " +
  "pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-11 pointer-coarse:after:-translate-1/2 pointer-coarse:after:content-[''] " +
  "focus-visible:shadow-focus data-[disabled]:pointer-events-none";

/** The value label above a pressed thumb. It sits on the thumb, so it follows it along the track. */
export const sliderBubbleClass =
  "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md border border-line bg-surface-2 px-2 py-0.5 " +
  "text-xs font-medium whitespace-nowrap text-fg shadow-sm tabular-nums";

/** The mark for the neutral value, under the track. Decoration only. */
export const sliderTickClass = "pointer-events-none absolute top-1/2 mt-1.5 h-1.5 w-px -translate-x-1/2 bg-fg-muted";
