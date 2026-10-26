<template>
  <Card as="section" padding="lg" :aria-label="t('serversAndAccess')" body-class="grid items-start gap-6 wide:grid-cols-2 wide:gap-0">
    <ServerAccessCard plain class="max-wide:order-2 max-wide:border-t max-wide:border-line max-wide:pt-6 wide:pr-8" />
    <ServersCard plain class="max-wide:order-1 wide:border-l wide:border-line wide:pl-8" />
  </Card>
</template>

<script setup lang="ts">
import { Card } from "@/shared/ui/card";
import ServerAccessCard from "@/features/admin/gateway/ServerAccessCard.vue";
import ServersCard from "@/features/admin/gateway/ServersCard.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();
</script>
