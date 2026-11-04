import { watch, type Ref } from "vue";
import { showToast, useToast } from "@/shared/composables/useToast";
import { notifyEvent } from "@/features/room/shell/roomNotify";
import { useI18n } from "@/shared/i18n/useI18n";
import type { NotificationSound } from "@/features/voice";
import type { ChannelGroup, ChannelInfo, ChatMessage, PokeNotification, RoomNotice, ServerGroup, VoiceState } from "@/features/session";

export interface UseRoomSoundsOptions {
  voiceState: Pick<VoiceState, "connected" | "reconnecting" | "reconnectFailed" | "tsClientId">;
  channels: ChannelInfo[];
  roomNotices: RoomNotice[];
  chatMessages: ChatMessage[];
  pokeNotifications: PokeNotification[];
  serverGroups: Readonly<Ref<readonly ServerGroup[]>>;
  channelGroups: Readonly<Ref<readonly ChannelGroup[]>>;
  playNotification: (kind: NotificationSound) => void;
}

interface GroupChange {
  kind: "server" | "channel";
  assigned: boolean;
  group: string;
}

/**
 * The server groups you gained or lost. The server hands the default group back when you lose the last other one, so it never
 * counts. A group the list does not know yet is skipped too, it cannot be named or told apart from the default.
 */
function serverGroupChanges(groups: readonly ServerGroup[], before: readonly number[], after: readonly number[]): GroupChange[] {
  const named = (id: number) => groups.find((group) => group.id === id);
  const change = (assigned: boolean, id: number): GroupChange[] => {
    const group = named(id);
    return group && !group.isDefault ? [{ kind: "server", assigned, group: group.name }] : [];
  };
  return [
    ...after.filter((id) => !before.includes(id)).flatMap((id) => change(true, id)),
    ...before.filter((id) => !after.includes(id)).flatMap((id) => change(false, id)),
  ];
}

/** Your channel group in the channel you stayed in. Falling back to the default group is a revoke, any other group an assign. */
function channelGroupChanges(groups: readonly ChannelGroup[], before: number, after: number): GroupChange[] {
  if (!before || !after || before === after) return [];
  const previous = groups.find((group) => group.id === before);
  const next = groups.find((group) => group.id === after);
  if (!previous || !next) return [];
  return [{ kind: "channel", assigned: !next.isDefault, group: next.isDefault ? previous.name : next.name }];
}

interface OwnGroups {
  channelId: string;
  server: number[];
  channel: number;
}

/**
 * What changed in your own groups. The channel group is sent again with every channel join, so it only counts when you stayed
 * in the channel and had one before.
 */
function ownGroupChanges(
  groups: { server: readonly ServerGroup[]; channel: readonly ChannelGroup[] },
  previous: OwnGroups,
  next: OwnGroups,
): GroupChange[] {
  if (!previous.channelId || next.channelId !== previous.channelId) return [];
  return [
    ...serverGroupChanges(groups.server, previous.server, next.server),
    ...channelGroupChanges(groups.channel, previous.channel, next.channel),
  ];
}

/** Notification sounds of the room: private chat, poke (plus its toast and desktop notification), connected, reconnecting,
 *  reconnect-failed, who joins or leaves the channel you are in and the groups you are given or lose (with a toast). */
export function useRoomSounds({
  voiceState,
  channels,
  roomNotices,
  chatMessages,
  pokeNotifications,
  serverGroups,
  channelGroups,
  playNotification,
}: UseRoomSoundsOptions): void {
  const { t } = useI18n();
  const { toasts } = useToast();

  const groupTitle = ({ kind, assigned, group }: GroupChange): string => {
    if (kind === "server") return assigned ? t("serverGroupAssigned", { group }) : t("serverGroupRevoked", { group });
    return assigned ? t("channelGroupAssigned", { group }) : t("channelGroupRevoked", { group });
  };

  const findOwn = () => {
    const channel = channels.find((candidate) => candidate.members?.some((member) => member.id === voiceState.tsClientId));
    return { channel, me: channel?.members?.find((member) => member.id === voiceState.tsClientId) };
  };

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
      const { channel } = findOwn();
      return {
        channelId: channel?.id ?? "",
        others: (channel?.members ?? []).map((member) => member.id).filter((id) => id !== voiceState.tsClientId),
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

  // Your own groups only. A warning toast stays silent, the cue is the same for server and channel groups.
  watch(
    () => {
      const { channel, me } = findOwn();
      return { channelId: channel?.id ?? "", server: [...(me?.serverGroups ?? [])], channel: me?.channelGroupId ?? 0 };
    },
    (next, previous) => {
      const changes = ownGroupChanges({ server: serverGroups.value, channel: channelGroups.value }, previous, next);
      for (const change of changes) notifyEvent(groupTitle(change), { variant: change.assigned ? "success" : "warning" });
      if (changes.length) playNotification(changes.some((change) => change.assigned) ? "groupAssigned" : "groupRevoked");
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
