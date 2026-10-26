<template>
  <div
    role="status"
    class="mt-2.5 flex min-h-5 items-center gap-2 text-caption"
    :class="status === 'offline' ? 'text-danger' : 'text-fg-muted'"
  >
    <span class="inline-block size-1.75 rounded-full" :class="dotClass" aria-hidden="true"></span>
    <span>{{ label }}</span>
    <span v-if="status === 'offline'" class="text-fg-muted">{{
      retryIn > 0 ? t("gatewayRetryIn", { seconds: retryIn }) : t("gatewayRetrying")
    }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { GatewayStatus } from "@/shared/composables/useGatewayStatus";

const props = defineProps<{ status: GatewayStatus; retryIn: number }>();

const { t } = useI18n();

const label = computed(() => ({ online: t("gatewayOnline"), offline: t("gatewayOffline"), checking: t("gatewayChecking") })[props.status]);
const dotClass = computed(
  () =>
    ({ online: "bg-success ring-4 ring-success/14", offline: "bg-danger ring-4 ring-danger/14", checking: "bg-fg-muted" })[props.status],
);
</script>
