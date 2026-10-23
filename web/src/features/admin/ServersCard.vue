<template>
  <Card as="article" padding="sm" body-class="grid content-start gap-3">
    <header class="flex items-start justify-between gap-3">
      <div>
        <h3 class="m-0 text-md font-bold">{{ t("teamSpeakServers") }}</h3>
        <p class="mt-1.25 mb-0 text-2xs leading-normal text-fg-muted">{{ t("teamSpeakServersLead") }}</p>
      </div>
      <Button variant="secondary" size="sm" class="shrink-0" @click="openAdd()"><Icon name="plus" :size="16" />{{ t("addServer") }}</Button>
    </header>
    <div v-if="!servers.length" class="rounded-md border border-dashed border-line bg-surface-0 px-3 py-2.5 text-caption text-fg-muted">
      {{ t("serverListEmpty") }}
    </div>
    <ul v-else class="m-0 grid list-none gap-2.5 p-0" :aria-label="t('teamSpeakServers')">
      <li
        v-for="server in servers"
        :key="server.id"
        class="server-row flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface-0 p-3 max-narrow:flex-wrap"
      >
        <span class="inline-flex shrink-0 items-center" :title="statusLabel(server)">
          <i class="size-2.5 rounded-full" :class="dotClass(statusOf(server))" aria-hidden="true"></i>
          <span aria-live="polite" class="sr-only">{{ statusLabel(server) }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <strong class="block truncate text-xs">{{ server.name }}</strong>
          <span class="mt-0.5 block truncate font-mono text-2xs text-fg-muted">{{ server.target }}</span>
        </div>
        <span v-if="server.hasPassword" class="inline-flex shrink-0 items-center gap-1 text-2xs text-fg-muted">
          <Icon name="lock" size="sm" />{{ t("passwordProtected") }}
        </span>
        <div class="flex shrink-0 items-center gap-1.75">
          <Button variant="outline" size="sm" :aria-label="t('editServerNamed', { name: server.name })" @click="openEdit(server)">{{
            t("edit")
          }}</Button>
          <Button
            variant="dangerSoft"
            size="sm"
            :aria-label="t('removeServerNamed', { name: server.name })"
            @click="removeServer(server)"
            >{{ t("remove") }}</Button
          >
        </div>
      </li>
    </ul>
    <ServerDialog />
  </Card>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import ServerDialog from "@/features/admin/ServerDialog.vue";
import { useAdminServersStore, type ServerStatus } from "@/features/admin/adminServers";
import type { AdminServer } from "@/features/admin/adminTypes";
import { useI18n } from "@/shared/i18n/useI18n";

const store = useAdminServersStore();
const { servers } = storeToRefs(store);
const { statusOf, openAdd, openEdit, removeServer, probeAll } = store;
const { t } = useI18n();

// Every visit checks the servers again, the stored result may be old.
onMounted(() => void probeAll());

const dotClass = (status: ServerStatus) => ({ online: "bg-success", probing: "bg-warning", unreachable: "bg-danger" })[status];
function statusLabel(server: AdminServer): string {
  const status = statusOf(server);
  return status === "online" ? t("serverOnline") : status === "probing" ? t("serverProbing") : t("serverUnreachable");
}
</script>
