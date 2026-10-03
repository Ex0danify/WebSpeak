import { watch } from "vue";
import { showToast } from "@/shared/composables/useToast";
import { useI18n } from "@/shared/i18n/useI18n";
import type { ChatMessage, PokeNotification, VoiceState } from "@/features/session";

export interface UseRoomSoundsOptions {
  voiceState: Pick<VoiceState, "connected" | "reconnecting" | "reconnectFailed">;
  chatMessages: ChatMessage[];
  pokeNotifications: PokeNotification[];
  playNotification: (kind: "connected" | "disconnected" | "poke" | "private" | "reconnectFailed") => void;
}

/** Notification sounds of the room: private chat, poke (plus its toast and desktop notification),
 *  connected, reconnecting and reconnect-failed. */
export function useRoomSounds({ voiceState, chatMessages, pokeNotifications, playNotification }: UseRoomSoundsOptions): void {
  const { t } = useI18n();

  watch(() => chatMessages.length, (length, previousLength) => {
    const latest = chatMessages[length - 1];
    if (latest && length > previousLength && latest.scope === "private" && !latest.isSelf) playNotification("private");
  });
  watch(() => pokeNotifications.length, (length, previousLength) => {
    const latest = pokeNotifications[length - 1];
    if (!latest || length <= previousLength) return;
    showToast(`${latest.invokerName} ${t("pokedYou")}${latest.message ? `：${latest.message}` : ""}`);
    playNotification("poke");
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(t("poke"), { body: `${latest.invokerName}: ${latest.message || t("pokedYou")}` });
  });
  watch(() => voiceState.connected, (connected) => {
    if (connected) playNotification("connected");
  });
  watch(() => voiceState.reconnecting, (reconnecting, wasReconnecting) => {
    if (reconnecting && !wasReconnecting) {
      playNotification("disconnected");
    }
  });
  watch(() => voiceState.reconnectFailed, (failed, wasFailed) => {
    if (failed && !wasFailed) playNotification("reconnectFailed");
  });
}
