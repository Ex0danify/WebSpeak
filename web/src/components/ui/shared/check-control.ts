/** Shared look of Checkbox and Radio: a reka-ui control inside a label that is the touch target. */
export const checkRowClass =
  "inline-flex min-h-6 cursor-pointer items-start gap-2.5 text-sm leading-6 text-fg max-[740px]:min-h-11 max-[740px]:items-center " +
  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";

/**
 * The 18 px box. Checkbox adds its corner radius, Radio makes it round. The
 * outline is an inset ring, not a border: the legacy `button { border: 0 }` in
 * WebClient.vue is unlayered and would beat the border utilities until step 6.
 */
export const checkBoxClass =
  "m-0 mt-[3px] grid size-[18px] shrink-0 cursor-[inherit] place-content-center border-0 bg-surface-1 p-0 shadow-[inset_0_0_0_1px_var(--color-line-strong)] text-accent-fg " +
  "transition-colors motion-reduce:transition-none max-[740px]:mt-0 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
