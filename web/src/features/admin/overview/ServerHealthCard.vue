<template>
  <AdminSection
    :title="t('serverHealth')"
    :lead="t('serverHealthLead')"
    padding="sm"
    flush
    leading="none"
    header-class="gap-0"
    class="p-6 max-narrow:p-4.5"
  >
    <template #action>
      <RouterLink to="/admin/server" class="text-caption font-bold text-accent no-underline">{{ t("manage") }}</RouterLink>
    </template>
    <ul class="m-0 mt-4.5 grid list-none gap-2.5 p-0">
      <AdminListRow v-for="server in overview.servers" :key="server.id" as="li" size="lg" class="flex items-center gap-3">
        <i class="size-1.75 shrink-0 rounded-full" :class="statusDot(server.status)" aria-hidden="true"></i>
        <div class="min-w-0 flex-1">
          <strong class="block truncate text-xs">{{ server.name }}</strong>
          <small class="mt-0.75 block truncate text-2xs text-fg-muted"
            >{{ statusText(server.status) }} · {{ formatDate(server.lastTestAt)
            }}{{ server.latencyMs == null ? "" : ` · ${server.latencyMs} ms` }}</small
          >
        </div>
      </AdminListRow>
      <AdminListRow v-if="!overview.servers.length" as="li" size="lg" class="text-center text-caption text-fg-muted">
        {{ t("serverListEmpty") }}
      </AdminListRow>
    </ul>
  </AdminSection>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import { useAdminOverviewStore } from "@/features/admin/overview/adminOverview";
import { useI18n } from "@/shared/i18n/useI18n";

const { language, t } = useI18n();
const { overview } = useAdminOverviewStore();
const { formatDate } = createAdminFormat(language, t);

const statusText = (status: string) =>
  status === "reachable" ? t("reachable") : status === "unreachable" ? t("unreachable") : t("notTested");
const statusDot = (status: string) => (status === "reachable" ? "bg-success" : status === "unreachable" ? "bg-danger" : "bg-line-strong");
</script>
