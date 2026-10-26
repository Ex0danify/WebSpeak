<template>
  <div
    class="flex items-center justify-between gap-4 rounded-lg p-6 text-fg max-desktop:items-start max-desktop:gap-5 max-desktop:p-4.5"
    :class="offline ? 'bg-danger-soft' : 'bg-accent-soft'"
  >
    <div>
      <small class="text-2xs font-extrabold tracking-label text-fg-muted">{{ t("systemStatus") }}</small>
      <h2 class="mt-2.25 mb-1.25 text-2xl font-bold">{{ offline ? t("gatewayOffline") : t("everythingRunning") }}</h2>
      <p class="m-0 text-xs text-fg-muted max-desktop:max-w-3/4">
        <template v-if="offline"
          >{{ t("gatewayOfflineLead") }} {{ retryIn > 0 ? t("gatewayRetryIn", { seconds: retryIn }) : t("gatewayRetrying") }}</template
        >
        <template v-else>{{ t("overviewLead") }}</template>
      </p>
    </div>
    <Button v-if="offline" variant="secondary" class="shrink-0" @click="retryNow()">{{ t("gatewayRetryNow") }}</Button>
    <Chip v-else variant="success" dot class="max-narrow:hidden">{{ t("running") }}</Chip>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminGatewayStore } from "@/features/admin/core/adminGateway";

const gateway = useAdminGatewayStore();
const { offline, retryIn } = storeToRefs(gateway);
const { retryNow } = gateway;
const { t } = useI18n();
</script>
