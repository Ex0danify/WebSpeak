import { storeToRefs } from "pinia";
import { useSessionStore } from "./sessionStore";
import { MAX_CHAT_MESSAGES, pushBounded } from "./sessionLimits";
import { LocalizedError, text, type LocalizedText } from "@/shared/i18n/localizedText";
import { normalizedClientErrorCode } from "./sessionErrors";
import { privateConversationKey } from "./format";
import type { ChatMessage, LatencyProbeResult } from "./sessionTypes";
import type { MessageHandlers } from "./messageRouter";

/** Outgoing commands and everything that waits on a reply: command completion, latency probes, chat,
 *  poke, away and whisper. Reads the session store directly. The pending maps are returned so the
 *  message router can settle them. */
export interface RoomActionsDeps {
  protocolErrorMessage: (code: string, fallback: string) => LocalizedText;
}

export function useSessionActions(deps: RoomActionsDeps) {
  const session = useSessionStore();
  const { ws, whisperActive } = storeToRefs(session);
  const { state, chatMessages, whisperTargetIds, members } = session;
  // A message of your own is flagged isSelf and rendered as "You"; the name only feeds avatars.
  const selfName = () => members.find((member) => member.isSelf)?.nickname ?? "";
  let latencyProbeSequence = 0;
  const pendingLatencyProbes = new Map<
    string,
    { startedAt: number; resolve: (result: LatencyProbeResult | null) => void; timer: ReturnType<typeof setTimeout> }
  >();
  let commandSequence = 0;
  const pendingCommands = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  function sendCmd(type: string, payload: Record<string, unknown> = {}, requestId = ""): void {
    if (ws.value?.readyState === WebSocket.OPEN) ws.value.send(JSON.stringify({ type, payload, ...(requestId ? { requestId } : {}) }));
  }

  function sendCommandAndWait(type: string, payload: Record<string, unknown>, timeoutMs = 8_000): Promise<void> {
    if (ws.value?.readyState !== WebSocket.OPEN)
      return Promise.reject(new LocalizedError(text("voiceConnectionNotReady"), "VOICE_CONNECTION_NOT_READY"));
    const requestId = `command-${Date.now().toString(36)}-${(commandSequence++).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCommands.delete(requestId);
        reject(new LocalizedError(text("commandTimeout"), "COMMAND_TIMEOUT"));
      }, timeoutMs);
      pendingCommands.set(requestId, { resolve, reject, timer });
      sendCmd(type, payload, requestId);
    });
  }

  function switchChannel(channelId: string, password = ""): void {
    state.error = "";
    state.errorCode = "";
    state.channelSwitchedChannelId = "";
    if (ws.value?.readyState !== WebSocket.OPEN) {
      state.errorCode = "VOICE_CONNECTION_NOT_READY";
      state.error = text("voiceConnectionNotReady");
      return;
    }
    sendCmd("switchChannel", { channelId, ...(password ? { password } : {}) });
  }

  function moveClient(clientId: number, channelId: string, password = ""): Promise<void> {
    return sendCommandAndWait("moveClient", { clientId, channelId, ...(password ? { password } : {}) });
  }

  function measureLatency(timeoutMs = 2_200): Promise<LatencyProbeResult | null> {
    const socket = ws.value;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const sequence = `latency-${Date.now().toString(36)}-${(latencyProbeSequence++).toString(36)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingLatencyProbes.delete(sequence);
        resolve(null);
      }, timeoutMs);
      pendingLatencyProbes.set(sequence, { startedAt: performance.now(), resolve, timer });
      sendCmd("latencyProbe", { sequence });
    });
  }

  function clearLatencyProbes(): void {
    for (const [sequence, pending] of pendingLatencyProbes) {
      clearTimeout(pending.timer);
      pendingLatencyProbes.delete(sequence);
      pending.resolve(null);
    }
  }

  function rejectPendingCommands(error: Error): void {
    for (const [requestId, pending] of pendingCommands) {
      clearTimeout(pending.timer);
      pendingCommands.delete(requestId);
      pending.reject(error);
    }
  }

  /** Shows the message at once as pending, then marks it failed if the gateway refuses it or does not answer. */
  function sendChat(
    type: string,
    payload: Record<string, unknown>,
    shown: Omit<ChatMessage, "id" | "timestamp" | "isSelf" | "status">,
  ): void {
    const id = `self-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    pushBounded(chatMessages, MAX_CHAT_MESSAGES, { id, ...shown, timestamp: Date.now(), isSelf: true, status: "pending" });
    const settle = (status: ChatMessage["status"]) => {
      const sent = chatMessages.find((candidate) => candidate.id === id);
      if (sent) sent.status = status;
    };
    sendCommandAndWait(type, payload).then(
      () => settle(undefined),
      () => settle("failed"),
    );
  }

  function sendTextMessage(message: string, targetId = ""): void {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 500) return;
    sendChat(
      "sendTextMessage",
      { message: trimmed },
      { scope: "channel", ...(targetId ? { targetId } : {}), senderId: state.tsClientId, invokerName: selfName(), message: trimmed },
    );
  }

  function sendServerMessage(message: string): void {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 500) return;
    sendChat(
      "sendServerMessage",
      { message: trimmed },
      { scope: "server", senderId: state.tsClientId, invokerName: selfName(), message: trimmed },
    );
  }

  function sendPrivateMessage(clientId: number, message: string, targetId = ""): void {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 500) return;
    const recipient = members.find((member) => member.id === clientId);
    sendChat(
      "sendPrivateMessage",
      { clientId, message: trimmed },
      {
        scope: "private",
        targetId,
        conversationId: privateConversationKey(recipient?.uid, clientId),
        ...(recipient?.nickname ? { peerName: recipient.nickname } : {}),
        senderId: state.tsClientId,
        invokerName: selfName(),
        message: trimmed,
      },
    );
  }

  function sendPoke(clientId: number, message = ""): Promise<void> {
    return sendCommandAndWait("poke", { clientId, message: message.trim().slice(0, 200) });
  }

  function setAway(away: boolean, message = ""): Promise<void> {
    return sendCommandAndWait("setAway", { away, message: message.trim().slice(0, 200) });
  }

  async function setWhisperTargets(clientIds: number[]): Promise<void> {
    const targets = [...new Set(clientIds)]
      .filter((clientId) => Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== state.tsClientId)
      .slice(0, 8);
    const previous = { targets: [...whisperTargetIds], active: whisperActive.value };
    whisperTargetIds.clear();
    for (const clientId of targets) whisperTargetIds.add(clientId);
    if (!targets.length) whisperActive.value = false;
    try {
      await sendCommandAndWait("setWhisperTargets", { targetIds: targets });
    } catch (error: unknown) {
      // The gateway kept the old list, so the local one goes back to it.
      applyWhisperState(previous.targets, previous.active);
      throw error;
    }
  }

  function setWhisperActive(active: boolean): void {
    if (active && !whisperTargetIds.size) return;
    whisperActive.value = active;
    sendCmd("setWhisperActive", { active });
  }

  function applyWhisperState(targetIds: unknown, active: unknown): void {
    whisperTargetIds.clear();
    if (Array.isArray(targetIds)) {
      for (const clientId of targetIds) {
        if (
          typeof clientId === "number" &&
          Number.isInteger(clientId) &&
          clientId > 0 &&
          clientId <= 65535 &&
          clientId !== state.tsClientId
        )
          whisperTargetIds.add(clientId);
      }
    }
    whisperActive.value = active === true && whisperTargetIds.size > 0;
  }

  const handlers: MessageHandlers = {
    channelSwitched: (msg) => {
      state.channelSwitchedChannelId = typeof msg.channelId === "string" || typeof msg.channelId === "number" ? String(msg.channelId) : "";
      state.error = "";
      state.errorCode = "";
    },
    latencyPong: (msg) => {
      const sequence = typeof msg.sequence === "string" ? msg.sequence : "";
      const pending = pendingLatencyProbes.get(sequence);
      if (!pending) return;
      pendingLatencyProbes.delete(sequence);
      clearTimeout(pending.timer);
      pending.resolve({
        browserRttMs: Math.max(0, Math.round(performance.now() - pending.startedAt)),
        teamSpeakLatencyMs: typeof msg.teamSpeakLatencyMs === "number" ? msg.teamSpeakLatencyMs : null,
        teamSpeakReachable: msg.teamSpeakReachable === true,
        ...(typeof msg.teamSpeakErrorCode === "string" ? { teamSpeakErrorCode: msg.teamSpeakErrorCode } : {}),
      });
    },
    whisperTargets: (msg) => {
      applyWhisperState(msg.targetIds, msg.active);
    },
    commandCompleted: (msg) => {
      const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
      const pending = requestId ? pendingCommands.get(requestId) : undefined;
      if (pending) {
        clearTimeout(pending.timer);
        pendingCommands.delete(requestId);
        pending.resolve();
      }
    },
    error: (msg) => {
      state.errorCode = normalizedClientErrorCode(msg.error?.code, "OPERATION_FAILED");
      state.error = deps.protocolErrorMessage(state.errorCode, String(msg.error?.message || msg.message || ""));
      {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        const pending = requestId ? pendingCommands.get(requestId) : undefined;
        if (pending) {
          clearTimeout(pending.timer);
          pendingCommands.delete(requestId);
          pending.reject(
            new LocalizedError(
              deps.protocolErrorMessage(state.errorCode, String(msg.error?.message || msg.message || "")),
              state.errorCode,
            ),
          );
        }
      }
    },
  };

  return {
    handlers,
    pendingCommands,
    pendingLatencyProbes,
    sendCmd,
    sendCommandAndWait,
    switchChannel,
    moveClient,
    measureLatency,
    clearLatencyProbes,
    rejectPendingCommands,
    sendTextMessage,
    sendServerMessage,
    sendPrivateMessage,
    sendPoke,
    setAway,
    setWhisperTargets,
    setWhisperActive,
    applyWhisperState,
  };
}
