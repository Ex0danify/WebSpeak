import { onScopeDispose, readonly, ref } from "vue";

export type GatewayStatus = "checking" | "online" | "offline";

export interface UseGatewayStatusOptions {
  /** Called when the gateway answers again after having been unreachable. */
  onRecover?: () => void;
}

const HEALTH_URL = "/api/health";
const TIMEOUT_MS = 4000;
const ONLINE_INTERVAL_MS = 20_000;
// After the first miss a quick second look confirms an outage, from then on a steady pace keeps a user who waits from hammering.
const CONFIRM_DELAY_MS = 1500;
const RETRY_DELAY_MS = 5000;
// One lost request is no outage, so the status flips only on the second miss in a row.
const FAILURES_UNTIL_OFFLINE = 2;

/** Polls the gateway's health route. Pauses while the tab is hidden and checks again the moment it is shown or the browser
 *  comes back online. */
export function useGatewayStatus({ onRecover }: UseGatewayStatusOptions = {}) {
  const status = ref<GatewayStatus>("checking");
  /** Whole seconds until the next attempt while the gateway is unreachable, 0 while one runs. */
  const retryIn = ref(0);
  let nextAt = 0;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let stopped = false;

  async function probe(): Promise<boolean> {
    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(HEALTH_URL, { cache: "no-store", signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(abort);
    }
  }

  function stopTicker() {
    clearInterval(ticker);
    ticker = undefined;
  }

  function schedule(delay: number) {
    clearTimeout(timer);
    stopTicker();
    if (stopped) return;
    timer = setTimeout(() => void check(), delay);
    nextAt = Date.now() + delay;
    retryIn.value = Math.ceil(delay / 1000);
    if (failures === 0) return;
    ticker = setInterval(() => (retryIn.value = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))), 250);
  }

  function check(): Promise<void> {
    clearTimeout(timer);
    stopTicker();
    retryIn.value = 0;
    inFlight ??= (async () => {
      const ok = await probe();
      inFlight = undefined;
      if (stopped) return;
      if (ok) {
        const recovered = status.value === "offline";
        failures = 0;
        status.value = "online";
        if (recovered) onRecover?.();
        schedule(ONLINE_INTERVAL_MS);
        return;
      }
      failures += 1;
      if (failures >= FAILURES_UNTIL_OFFLINE) status.value = "offline";
      schedule(failures === 1 ? CONFIRM_DELAY_MS : RETRY_DELAY_MS);
    })();
    return inFlight;
  }

  function onVisibility() {
    if (document.hidden) {
      clearTimeout(timer);
      stopTicker();
    } else void check();
  }
  function onOnline() {
    void check();
  }

  function start() {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    void check();
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    stopTicker();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
  }

  onScopeDispose(stop);

  return { status: readonly(status), retryIn: readonly(retryIn), start, stop, check };
}
