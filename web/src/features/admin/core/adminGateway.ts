import { computed, effectScope, ref, watchEffect, type EffectScope } from "vue";
import { defineStore } from "pinia";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useGatewayStatus, type GatewayStatus } from "@/shared/composables/useGatewayStatus.js";

/** Whether the gateway itself answers, checked while the console is open. The console is served by it, so the pages
 *  cannot say anything about it when it is gone. */
export const useAdminGatewayStore = defineStore("adminGateway", () => {
  const status = ref<GatewayStatus>("checking");
  const retryIn = ref(0);
  /** Counts the returns of the gateway, a page keyed by it loads its data again. */
  const recoveries = ref(0);
  // Not offline until the second miss, so the first look does not flash a warning.
  const offline = computed(() => status.value === "offline");

  let scope: EffectScope | undefined;
  let poll: ReturnType<typeof useGatewayStatus> | undefined;

  async function onRecover() {
    recoveries.value += 1;
    const siblings = adminSiblings();
    await Promise.all([siblings.loadOverview(), siblings.loadServerSettings(), siblings.loadServers()]).catch(() => {});
  }

  function start() {
    if (scope) return;
    scope = effectScope(true);
    scope.run(() => {
      poll = useGatewayStatus({ onRecover: () => void onRecover() });
      watchEffect(() => {
        status.value = poll!.status.value;
        retryIn.value = poll!.retryIn.value;
      });
    });
    poll!.start();
  }

  function stop() {
    scope?.stop();
    scope = undefined;
    poll = undefined;
    status.value = "checking";
    retryIn.value = 0;
  }

  function retryNow() {
    return poll?.check();
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    stop();
    recoveries.value = 0;
  }

  return { status, retryIn, offline, recoveries, start, stop, retryNow, reset };
});
