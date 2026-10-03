<template>
  <div class="client-layout">
    <RouterView />
    <Toaster :label="t('notifications')" :dismiss-label="t('close')" class="p-6 min-[851px]:p-[calc(24px/var(--ui-scale))]" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { RouterView, useRouter } from "vue-router";
import { useServerVisit } from "@/features/join";
import { provideRoomSession, useRoomSession, useRoomSounds } from "@/features/room";
import { useAppearance } from "@/shared/composables/useAppearance";
import { isLanguage, useI18n } from "@/shared/i18n/useI18n";
import { loadLocalPreferences } from "@/shared/services/localPersistence";
import { readStorage } from "@/shared/services/safeStorage";
import { Toaster } from "@/shared/ui/toast";

const room = useRoomSession();
provideRoomSession(room);

const { loadLanguage, t } = useI18n();
loadLanguage();
const { language, setThemeMode } = useAppearance();

// Connection lifecycle: owned here so it survives the join page being replaced by the room.
const { state: voiceState, identityMaterial } = room.session;
useRoomSounds({
  voiceState,
  chatMessages: room.chat.chatMessages,
  pokeNotifications: room.roster.pokeNotifications,
  playNotification: room.audio.playNotification,
});
useServerVisit({ voiceState, identityMaterial });

// The join page shows until a session exists; the room covers connected, reconnecting and failed.
// Entering or leaving the room replaces the history entry, so Back never lands on a dead page, and
// going to "/" drops the query (an invite token is consumed by then).
const inRoom = computed(() => voiceState.connected || voiceState.reconnecting || voiceState.reconnectFailed);
const router = useRouter();
watch(inRoom, (value) => {
  void router.replace(value ? { name: "room" } : { name: "join" });
});

onMounted(() => {
  void loadLocalPreferences().then((preferences) => {
    if (!readStorage("webspeak:language") && isLanguage(preferences.language)) language.value = preferences.language;
    if (!readStorage("webspeak:theme") && (preferences.theme === "system" || preferences.theme === "light" || preferences.theme === "dark")) {
      setThemeMode(preferences.theme);
    }
  });
});

onUnmounted(() => {
  room.session.disconnect();
});
</script>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; background: var(--ws-surface-0); color: var(--ws-fg); font-family: var(--font-sans); }

.client-layout { min-height: 100dvh; outline: none; background: var(--ws-surface-0); color: var(--ws-fg); line-height: normal; }

:global(html), :global(body), :global(#app) { width: 100%; height: 100dvh; min-height: 0; max-height: 100dvh; }
:global(body) { overflow-x: hidden; overflow-y: auto; }
.client-layout { height: 100dvh; min-height: 0; max-height: 100dvh; }
.client-layout { overflow: hidden; }

.client-layout { background: var(--ws-surface-0); color: var(--ws-fg); }
:global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible), :global(select:focus-visible), :global(textarea:focus-visible) { outline: 3px solid color-mix(in srgb, var(--ws-accent) 55%, transparent); outline-offset: 2px; }

/* The document itself never becomes the scroll surface. Each view owns its
   content scroll area so headers, controls and mobile navigation stay fixed. */
:global(html), :global(body), :global(#app) { width: 100%; height: 100dvh; min-height: 0; max-height: 100dvh; overflow: hidden; }

/* Desktop zoom compensation. main.ts sets --ui-scale (>1 only on large
   viewports) and App.vue applies zoom:var(--ui-scale) on #app. html/body stay
   pinned to the real viewport (100dvh) while the zoomed roots divide their
   height by the scale so the rendered result lands on exactly one viewport.
   Without this a 2K/4K viewport would render a 1.5x-tall shell, clipping the
   bottom of the workspace and leaving blank space under the control dock.
   Non-zero fixed offsets (poke banner stack, in the template) are divided back to CSS pixels
   because zoom also scales fixed coordinates against the viewport. */
@media (min-width: 851px) {
  :global(html), :global(body) { height: 100dvh; max-height: 100dvh; }
  :global(#app), .client-layout { height: calc(100dvh / var(--ui-scale)); min-height: 0; max-height: calc(100dvh / var(--ui-scale)); }
}

/* Match every native scroll surface to the WebSpeak palette. */
:global(*) { scrollbar-color: var(--ws-line-strong) transparent; scrollbar-width: thin; }
:global(*::-webkit-scrollbar) { width: 8px; height: 8px; }
:global(*::-webkit-scrollbar-track) { background: transparent; }
:global(*::-webkit-scrollbar-thumb) { background: var(--ws-line-strong); background-clip: padding-box; border: 2px solid transparent; border-radius: 999px; }
:global(*::-webkit-scrollbar-thumb:hover) { background: var(--ws-fg-muted); background-clip: padding-box; border-width: 1px; }

/* Mobile interaction pass: keep the browser viewport fixed and give each
   mobile surface its own touch-friendly scroll area. */
@media (max-width: 740px) {
  :global(html), :global(body), :global(#app) { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
  .client-layout { height: 100dvh; height: 100svh; min-height: 100dvh; min-height: 100svh; max-height: 100dvh; max-height: 100svh; }
}
</style>
