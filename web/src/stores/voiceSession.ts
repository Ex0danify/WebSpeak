import { defineStore } from "pinia";
import { reactive, ref, shallowRef } from "vue";
import type { ChannelInfo, ChannelMember, ChatMessage, ServerEvent, VoiceState } from "../composables/voice/types";

export type PokeNotification = { id: string; invokerId: number; invokerUid: string; invokerName: string; message: string; timestamp: number };

function initialState(): VoiceState {
  return { connected: false, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false, tsClientId: 0, error: "", errorCode: "", microphoneError: "", microphoneErrorCode: "", audioNotice: "", audioNoticeCode: "", channelSwitchedChannelId: "" };
}

/** Reactive session state the UI reads. Pinia stores are per-app singletons, so useVoiceWebSocket()
 *  calls reset() to keep the fresh-state-per-mount behaviour it had when this state was closure-local
 *  (decision V-D1). Sockets, timers and audio objects never belong here (V-D3). */
export const useVoiceSessionStore = defineStore("voiceSession", () => {
  const ws = shallowRef<WebSocket | null>(null);
  const state = reactive<VoiceState>(initialState());
  const members = reactive<ChannelMember[]>([]);
  const channels = reactive<ChannelInfo[]>([]);
  const chatMessages = reactive<ChatMessage[]>([]);
  const serverEvents = reactive<ServerEvent[]>([]);
  const pokeNotifications = reactive<PokeNotification[]>([]);
  const speakingIds = reactive(new Set<number>());
  const whisperTargetIds = reactive(new Set<number>());
  const whisperActive = ref(false);

  function reset(): void {
    ws.value = null;
    Object.assign(state, initialState());
    members.splice(0);
    channels.splice(0);
    chatMessages.splice(0);
    serverEvents.splice(0);
    pokeNotifications.splice(0);
    speakingIds.clear();
    whisperTargetIds.clear();
    whisperActive.value = false;
  }

  return { ws, state, members, channels, chatMessages, serverEvents, pokeNotifications, speakingIds, whisperTargetIds, whisperActive, reset };
});
