import { onBeforeUnmount, ref, watch, type Ref } from "vue";

const SEARCH_DELAY_MS = 300;

/**
 * The text of a search box. Typing calls `apply` only once it pauses, and a search that changes from outside (a reset of the
 * filters) empties or fills the box.
 */
export function useDebouncedSearch(current: () => string, apply: (search: string) => unknown): Ref<string> {
  const text = ref(current());
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(text, (value) => {
    clearTimeout(timer);
    if (value.trim() === current().trim()) return;
    timer = setTimeout(() => apply(value), SEARCH_DELAY_MS);
  });
  watch(current, (value) => {
    if (value.trim() !== text.value.trim()) text.value = value;
  });
  onBeforeUnmount(() => clearTimeout(timer));

  return text;
}
