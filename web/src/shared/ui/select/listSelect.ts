// Popup and row classes for ListSelect. They live here, like menu.ts, so the reka size variables and the
// fixed row height stay out of the component's scanned template.
export const listSelectContentClass =
  "z-50 max-h-[var(--reka-select-content-available-height)] w-[var(--reka-select-trigger-width)] overflow-y-auto " +
  "rounded-lg border border-line bg-surface-1 p-1.5 shadow-lg outline-none";

export const listSelectItemClass =
  "relative flex h-[34px] cursor-pointer items-center gap-2 rounded-sm px-2.5 text-sm text-fg outline-none select-none " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 " +
  "data-[state=checked]:bg-surface-0 data-[state=checked]:text-accent max-compact:h-11";
