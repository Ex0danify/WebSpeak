import { onBeforeUnmount, onMounted } from "vue";

/**
 * Runs `refresh` every `intervalMs` while the component is mounted and the tab is visible, and once when the tab comes back. A tick
 * never overlaps the one before it. A failed refresh is ignored, the top bar already says when the gateway is gone.
 */
export function useLiveRefresh(refresh: () => Promise<unknown> | void, intervalMs: number): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  async function tick() {
    if (running || document.hidden) return;
    running = true;
    try {
      await refresh();
    } catch {
      // the next tick tries again
    } finally {
      running = false;
    }
  }

  const onVisible = () => void tick();

  onMounted(() => {
    timer = setInterval(() => void tick(), intervalMs);
    document.addEventListener("visibilitychange", onVisible);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  });
}
