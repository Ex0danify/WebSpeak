<template>
  <div
    class="flex items-center gap-3 rounded-lg px-4 py-3 text-fg max-narrow:flex-wrap"
    :class="offline ? 'bg-danger-soft' : 'bg-accent-soft'"
  >
    <Icon v-if="offline" name="alert" :size="16" class="shrink-0 text-danger" aria-hidden="true" />
    <i v-else class="size-2 shrink-0 rounded-full bg-success" aria-hidden="true"></i>
    <h2 class="m-0 shrink-0 text-md font-bold">{{ offline ? t("gatewayOffline") : t("everythingRunning") }}</h2>
    <!-- One line beside the heading, the full text is the title and wraps on a phone. -->
    <p class="m-0 min-w-0 flex-1 truncate text-xs text-fg-muted max-narrow:basis-full max-narrow:whitespace-normal" :title="lead">
      {{ lead }}
    </p>
    <template v-if="offline">
      <span class="shrink-0 text-xs text-fg-muted">{{
        retryIn > 0 ? t("gatewayRetryIn", { seconds: retryIn }) : t("gatewayRetrying")
      }}</span>
      <Button variant="secondary" size="sm" class="shrink-0" @click="retryNow()">{{ t("gatewayRetryNow") }}</Button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminGatewayStore } from "@/features/admin/core/adminGateway";

const gateway = useAdminGatewayStore();
const { offline, retryIn } = storeToRefs(gateway);
const { retryNow } = gateway;
const { t } = useI18n();

const lead = computed(() => (offline.value ? t("gatewayOfflineLead") : t("overviewLead")));
</script>
