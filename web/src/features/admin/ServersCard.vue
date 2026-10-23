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
        <div class="min-w-0 flex-1">
          <strong class="block truncate text-xs">{{ server.name }}</strong>
          <span class="mt-0.5 block truncate font-mono text-2xs text-fg-muted">{{ server.target }}</span>
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
  </Card>
</template>

<script setup lang="ts">
import { nextTick, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import ServerDialog from "@/features/admin/ServerDialog.vue";
import { useAdminServersStore, type ServerStatus } from "@/features/admin/adminServers";
import type { AdminServer } from "@/features/admin/adminTypes";
import { useI18n } from "@/shared/i18n/useI18n";

const store = useAdminServersStore();
const { servers, grabbed, announcement } = storeToRefs(store);
const { statusOf, openAdd, openEdit, removeServer, probeAll, grabServer, moveGrabbedTo, shiftGrabbed, dropServer, cancelGrab } = store;
const hintId = "server-reorder-hint";
const { t } = useI18n();

// Every visit checks the servers again, the stored result may be old.
onMounted(() => void probeAll());

// The handle of each row, to give the focus back after the row moved in the DOM.
const handles = new Map<string, { $el?: HTMLElement } | HTMLElement>();
function setHandle(id: string, el: unknown) {
  if (el) handles.set(id, el as HTMLElement);
  else handles.delete(id);
}
async function refocus(id: string) {
  await nextTick();
  const handle = handles.get(id);
  ((handle as { $el?: HTMLElement })?.$el ?? (handle as HTMLElement | undefined))?.focus();
}

async function onHandleKey(event: KeyboardEvent, id: string) {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    if (grabbed.value === id) await dropServer();
    else grabServer(id);
  } else if (grabbed.value === id && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    shiftGrabbed(event.key === "ArrowUp" ? -1 : 1);
    await refocus(id);
  } else if (grabbed.value === id && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancelGrab();
  }
}

// Leaving for another control puts the server down. A blur without a target is the row moving in the DOM, not the person leaving.
function onHandleBlur(event: FocusEvent) {
  if (event.relatedTarget) void dropServer();
}

// A tap moves one step and saves at once, there is no held state on touch.
async function moveByButton(id: string, delta: number) {
  grabServer(id);
  shiftGrabbed(delta);
  await dropServer();
  await refocus(id);
}

function onDragStart(event: DragEvent, id: string) {
  grabServer(id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }
}
function onDragEnter(id: string) {
  if (grabbed.value) moveGrabbedTo(servers.value.findIndex((server) => server.id === id));
}
// A drag the browser cancelled (Esc, or released outside a drop target) reports no drop effect.
function onDragEnd(event: DragEvent) {
  if (event.dataTransfer?.dropEffect === "none") cancelGrab();
  else void dropServer();
}

const dotClass = (status: ServerStatus) => ({ online: "bg-success", probing: "bg-warning", unreachable: "bg-danger" })[status];
function statusLabel(server: AdminServer): string {
  const status = statusOf(server);
  return status === "online" ? t("serverOnline") : status === "probing" ? t("serverProbing") : t("serverUnreachable");
}
</script>
