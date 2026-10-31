import { watch } from "vue";
import { showToast, useToast } from "@/shared/composables/useToast";
import { useI18n } from "@/shared/i18n/useI18n";
import type { NotificationSound } from "@/features/voice";
import type { ChannelInfo, ChatMessage, PokeNotification, RoomNotice, VoiceState } from "@/features/session";

export interface UseRoomSoundsOptions {
  voiceState: Pick<VoiceState, "connected" | "reconnecting" | "reconnectFailed" | "tsClientId">;
  channels: ChannelInfo[];
  roomNotices: RoomNotice[];
  chatMessages: ChatMessage[];
  pokeNotifications: PokeNotification[];
  playNotification: (kind: NotificationSound) => void;
}

/** Notification sounds of the room: private chat, poke (plus its toast and desktop notification), connected, reconnecting,
 *  reconnect-failed and who joins or leaves the channel you are in. */
export function useRoomSounds({
  voiceState,
  channels,
  roomNotices,
  chatMessages,
  pokeNotifications,
  playNotification,
}: UseRoomSoundsOptions): void {
  const { t } = useI18n();
  const { toasts } = useToast();

  watch(
    () => chatMessages.length,
    (length, previousLength) => {
      const latest = chatMessages[length - 1];
      if (latest && length > previousLength && latest.scope === "private" && !latest.isSelf) playNotification("private");
    },
  );
  watch(
    () => pokeNotifications.length,
    (length, previousLength) => {
      const latest = pokeNotifications[length - 1];
      if (!latest || length <= previousLength) return;
      showToast(`${latest.invokerName} ${t("pokedYou")}${latest.message ? `: ${latest.message}` : ""}`);
      playNotification("poke");
      if (typeof Notification !== "undefined" && Notification.permission === "granted")
        new Notification(t("poke"), { body: `${latest.invokerName}: ${latest.message || t("pokedYou")}` });
    },
  );
  watch(
    () => voiceState.connected,
    (connected) => {
      if (connected) playNotification("connected");
    },
  );
  watch(
    () => voiceState.reconnecting,
    (reconnecting, wasReconnecting) => {
      if (reconnecting && !wasReconnecting) {
        playNotification("disconnected");
      }
    },
  );
  watch(
    () => voiceState.reconnectFailed,
    (failed, wasFailed) => {
      if (failed && !wasFailed) playNotification("reconnectFailed");
    },
  );

  // Compares the member list of your own channel. The first snapshot after connecting is skipped, the connected cue covers it.
  watch(
    () => {
      const own = channels.find((channel) => channel.members?.some((member) => member.id === voiceState.tsClientId));
      return {
        channelId: own?.id ?? "",
        others: (own?.members ?? []).map((member) => member.id).filter((id) => id !== voiceState.tsClientId),
      };
    },
    (next, previous) => {
      if (!previous.channelId || !next.channelId) return;
      if (next.channelId !== previous.channelId) {
        playNotification("channelSwitched");
        return;
      }
      if (next.others.some((id) => !previous.others.includes(id))) playNotification("userJoined");
      else if (previous.others.some((id) => !next.others.includes(id))) playNotification("userLeft");
    },
  );

  // Every failure ends up as a danger toast or banner, so one cue here covers them all. Warnings stay silent.
  watch(
    () => toasts.value.at(-1)?.id,
    () => {
      if (toasts.value.at(-1)?.variant === "danger") playNotification("error");
    },
  );
  watch(
    () => roomNotices.filter((notice) => notice.variant === "danger").map((notice) => notice.code),
    (codes, previous) => {
      if (codes.some((code) => !previous.includes(code))) playNotification("error");
    },
  );
}
