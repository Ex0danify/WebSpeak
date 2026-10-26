<template>
  <AdminSection :title="t('teamSpeakServers')" :lead="t('teamSpeakServersLead')" :status="status">
    <template #action>
      <Button variant="secondary" size="sm" class="shrink-0" @click="openAdd()"><Icon name="plus" :size="16" />{{ t("addServer") }}</Button>
    </template>
    <div v-if="!servers.length" class="rounded-md border border-dashed border-line bg-surface-0 px-3 py-2.5 text-caption text-fg-muted">
      {{ t("serverListEmpty") }}
    </div>
    <ul v-else class="m-0 grid list-none gap-2.5 p-0" :aria-label="t('teamSpeakServers')" :aria-describedby="hintId">
      <li
        v-for="server in servers"
        :key="server.id"
        class="server-row flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface-0 p-3 max-narrow:flex-wrap"
        :class="grabbed === server.id && 'opacity-60 outline-2 outline-accent'"
        :draggable="servers.length > 1"
        @dragstart="onDragStart($event, server.id)"
        @dragenter.prevent="onDragEnter(server.id)"
        @dragover.prevent
        @drop.prevent
        @dragend="onDragEnd($event)"
      >
        <Button
          v-if="servers.length > 1"
          :ref="(el) => setHandle(server.id, el)"
          variant="ghost"
          size="sm"
          icon-only
          class="cursor-grab touch-none"
          :pressed="grabbed === server.id"
          :aria-label="t('reorderServerNamed', { name: server.name })"
          @keydown="onHandleKey($event, server.id)"
          @blur="onHandleBlur($event)"
        >
          <Icon name="grip" :size="18" />
        </Button>
        <span class="inline-flex shrink-0 items-center" :title="statusLabel(server)">
          <i class="size-2.5 rounded-full" :class="dotClass(statusOf(server))" aria-hidden="true"></i>
          <span aria-live="polite" class="sr-only">{{ statusLabel(server) }}</span>
        </span>
        <div class="min-w-0 flex-1 max-narrow:basis-40">
          <strong :class="[cell, 'block text-xs']">{{ server.name }}</strong>
          <span :class="[cell, 'mt-0.5 block font-mono text-2xs text-fg-muted']">{{ server.target }}</span>
        </div>
        <span v-if="server.hasPassword" class="inline-flex shrink-0 items-center gap-1 text-2xs text-fg-muted">
          <Icon name="lock" size="sm" />{{ t("passwordProtected") }}
        </span>
        <div class="flex shrink-0 items-center gap-1.75">
          <!-- Touch has neither a drag handle that works nor arrow keys, so it moves a server with these. -->
          <template v-if="servers.length > 1">
            <Button
              variant="outline"
              size="sm"
              icon-only
              class="hidden pointer-coarse:inline-flex"
              :disabled="servers[0]?.id === server.id"
              :aria-label="t('moveServerUpNamed', { name: server.name })"
              @click="moveByButton(server.id, -1)"
              ><Icon name="chevron-down" :size="16" class="rotate-180"
            /></Button>
            <Button
              variant="outline"
              size="sm"
              icon-only
              class="hidden pointer-coarse:inline-flex"
              :disabled="servers.at(-1)?.id === server.id"
              :aria-label="t('moveServerDownNamed', { name: server.name })"
              @click="moveByButton(server.id, 1)"
              ><Icon name="chevron-down" :size="16"
            /></Button>
          </template>
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
    <p :id="hintId" class="sr-only">{{ t("reorderHint") }}</p>
    <p aria-live="polite" class="sr-only">{{ announcement }}</p>
    <ServerDialog />
  </AdminSection>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { SERVER_LIST_STATUS, useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import ServerDialog from "@/features/admin/gateway/ServerDialog.vue";
import { useAdminServerDialogStore } from "@/features/admin/gateway/adminServerDialog";
import { useAdminServerOrderStore } from "@/features/admin/gateway/adminServerOrder";
import { useAdminServersStore, type ServerStatus } from "@/features/admin/gateway/adminServers";
import type { AdminServer } from "@/features/admin/core/adminTypes";
import { useServerReorder } from "@/features/admin/gateway/useServerReorder";
import { useI18n } from "@/shared/i18n/useI18n";

const status = useAdminFeedbackStore().statusOf(SERVER_LIST_STATUS);
const store = useAdminServersStore();
const { servers } = storeToRefs(store);
const { statusOf, removeServer, probeAll } = store;
const { announcement } = storeToRefs(useAdminServerOrderStore());
const { openAdd, openEdit } = useAdminServerDialogStore();
const { grabbed, setHandle, onHandleKey, onHandleBlur, moveByButton, onDragStart, onDragEnter, onDragEnd } = useServerReorder();
const hintId = "server-reorder-hint";
// A long name or address is cut short beside the buttons and wraps on a phone, where the buttons go below.
const cell = "truncate max-narrow:overflow-visible max-narrow:wrap-anywhere max-narrow:whitespace-normal";
const { t } = useI18n();

// Every visit checks the servers again, the stored result may be old.
onMounted(() => void probeAll());

const dotClass = (status: ServerStatus) => ({ online: "bg-success", probing: "bg-warning", unreachable: "bg-danger" })[status];
function statusLabel(server: AdminServer): string {
  const status = statusOf(server);
  return status === "online" ? t("serverOnline") : status === "probing" ? t("serverProbing") : t("serverUnreachable");
}
</script>
