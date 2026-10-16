<template>
  <Card as="article" padding="lg" body-class="flex min-h-0 flex-col" class="min-h-0 overflow-hidden max-desktop:overflow-visible">
    <header class="flex items-start justify-between gap-3.75">
      <div>
        <h3 class="text-md font-bold">{{ t("audit") }}</h3>
        <p class="mt-1.25 text-2xs leading-tight text-fg-muted">{{ t("auditLead") }}</p>
      </div>
    </header>
    <ul class="mt-4.5 grid min-h-0 flex-1 basis-0 gap-2.5 overflow-y-auto max-desktop:flex-none max-desktop:overflow-visible">
      <li
        v-for="event in operations.audit"
        :key="`${event.event}-${event.createdAt}`"
        class="flex items-center gap-2.5 rounded-md bg-surface-0 p-2.5"
      >
        <span class="grid size-6.75 place-items-center rounded-md bg-accent-soft text-accent"><Icon name="check" :size="14" /></span>
        <div>
          <strong class="block text-caption">{{ eventName(event.event) }}</strong>
          <small class="mt-0.75 block text-2xs text-fg-muted">{{ formatDate(event.createdAt) }}</small>
        </div>
      </li>
      <li v-if="!operations.audit.length" class="rounded-md bg-surface-0 p-2.5 text-center text-fg-muted">{{ t("auditEmpty") }}</li>
    </ul>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Card } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import { createAdminFormat } from "@/features/admin/adminFormat";
import { useAdminOperationsStore } from "@/features/admin/adminOperations";

const { operations } = storeToRefs(useAdminOperationsStore());
const { language, t } = useI18n();
const { eventName, formatDate } = createAdminFormat(language, t);
</script>
