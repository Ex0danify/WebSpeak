import { onScopeDispose, ref, type Ref } from "vue";

// Reactive `matchMedia`. The listener is removed with the calling scope.
export function useMediaQuery(query: string): Ref<boolean> {
  const list = window.matchMedia(query);
  const matches = ref(list.matches);
  const update = () => (matches.value = list.matches);
  list.addEventListener("change", update);
  onScopeDispose(() => list.removeEventListener("change", update));
  return matches;
}
