<template>
  <div
    class="h-dvh max-h-dvh min-h-0 overflow-hidden bg-surface-0 leading-[normal] text-fg outline-none max-compact:h-svh max-compact:max-h-svh max-compact:min-h-svh desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))]"
  >
    <RouterView />
    <Toaster :label="t('notifications')" :dismiss-label="t('close')" class="p-6 desktop:p-[calc(24px/var(--ui-scale))]" />
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
    if (
      !readStorage("webspeak:theme") &&
      (preferences.theme === "system" || preferences.theme === "light" || preferences.theme === "dark")
    ) {
      setThemeMode(preferences.theme);
    }
  });
});

onUnmounted(() => {
  room.session.disconnect();
});
</script>
