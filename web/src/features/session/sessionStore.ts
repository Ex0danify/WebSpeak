import { defineStore } from "pinia";
import { reactive, ref, shallowRef } from "vue";
import type { ChannelInfo, ChannelMember, ChatMessage, RoomNotice, ServerEvent, VoiceState } from "@/features/session/sessionTypes";

export type PokeNotification = {
  id: string;
  invokerId: number;
  invokerUid: string;
  invokerName: string;
  message: string;
  timestamp: number;
};

function initialState(): VoiceState {
  return {
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectFailed: false,
    tsClientId: 0,
    error: "",
    errorCode: "",
    unattributedError: null,
    microphoneError: "",
    microphoneErrorCode: "",
    channelSwitchedChannelId: "",
  };
}

/** Reactive session state the UI reads. Pinia stores are per-app singletons, so useRoomSession() calls reset() to start each
 *  mount fresh. Sockets, timers and audio objects never belong here. */
export const useSessionStore = defineStore("voiceSession", () => {
  const ws = shallowRef<WebSocket | null>(null);
  const state = reactive<VoiceState>(initialState());
  const members = reactive<ChannelMember[]>([]);
  const channels = reactive<ChannelInfo[]>([]);
  const chatMessages = reactive<ChatMessage[]>([]);
  const serverEvents = reactive<ServerEvent[]>([]);
  const pokeNotifications = reactive<PokeNotification[]>([]);
  const roomNotices = reactive<RoomNotice[]>([]);
  const speakingIds = reactive(new Set<number>());
  const whisperTargetIds = reactive(new Set<number>());
  const whisperActive = ref(false);

  function setRoomNotice(notice: RoomNotice): void {
    for (let i = roomNotices.length - 1; i >= 0; i--) {
      const existing = roomNotices[i];
      if (existing.code === notice.code || (notice.group && existing.group === notice.group)) roomNotices.splice(i, 1);
    }
    roomNotices.push(notice);
  }

  /** Without arguments every notice goes, with a code only that one, with a group the whole group. */
  function clearRoomNotice(code?: string, group?: string): void {
    for (let i = roomNotices.length - 1; i >= 0; i--) {
      const notice = roomNotices[i];
      if ((!code && !group) || (code && notice.code === code) || (group && notice.group === group)) roomNotices.splice(i, 1);
    }
  }

  function hasRoomNotice(code: string): boolean {
    return roomNotices.some((notice) => notice.code === code);
  }

  function reset(): void {
    ws.value = null;
    Object.assign(state, initialState());
    members.splice(0);
    channels.splice(0);
    chatMessages.splice(0);
    serverEvents.splice(0);
    pokeNotifications.splice(0);
    roomNotices.splice(0);
    speakingIds.clear();
    whisperTargetIds.clear();
    whisperActive.value = false;
  }

  return {
    ws,
    state,
    members,
    channels,
    chatMessages,
    serverEvents,
    pokeNotifications,
    roomNotices,
    setRoomNotice,
    clearRoomNotice,
    hasRoomNotice,
    speakingIds,
    whisperTargetIds,
    whisperActive,
    reset,
  };
});
