<template>
  <section :class="adminPageWide">
    <div class="mb-4 flex shrink-0 items-start justify-between max-desktop:flex-wrap max-narrow:gap-3.75">
      <div>
        <h2 class="text-2xl font-bold">{{ t("operations") }}</h2>
        <p class="mt-1.75 text-xs text-fg-muted">{{ t("operationsLead") }}</p>
      </div>
      <Button variant="secondary" :loading="operationsLoading" @click="loadOperations()">
        <Icon v-if="!operationsLoading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </div>
    <Banner class="mb-3 shrink-0">{{ t("updateNotice", { version: operations.diagnostics.version || "—" }) }}</Banner>
    <div
      class="grid min-h-0 min-w-0 shrink-0 basis-62.5 grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)] gap-4.5 max-desktop:basis-auto max-desktop:grid-cols-1"
    >
      <SessionsCard />
      <InvitesCard />
    </div>
    <div
      class="mt-3.5 grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(210px,.9fr)_minmax(0,1.1fr)_minmax(210px,.9fr)] gap-4.5 max-desktop:flex-none max-desktop:grid-cols-1"
    >
      <DiagnosticsCard />
      <LogViewerCard />
      <AuditCard />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import { adminPageWide } from "@/features/admin/adminPage";
import { useAdminOperationsStore } from "@/features/admin/adminOperations";
import AuditCard from "@/features/admin/operations/AuditCard.vue";
import DiagnosticsCard from "@/features/admin/operations/DiagnosticsCard.vue";
import InvitesCard from "@/features/admin/operations/InvitesCard.vue";
import LogViewerCard from "@/features/admin/operations/LogViewerCard.vue";
import SessionsCard from "@/features/admin/operations/SessionsCard.vue";

const operationsStore = useAdminOperationsStore();
const { operations, operationsLoading } = storeToRefs(operationsStore);
const { loadOperations } = operationsStore;
// The page loads its own data whenever it is entered.
onMounted(loadOperations);

const { t } = useI18n();
</script>
