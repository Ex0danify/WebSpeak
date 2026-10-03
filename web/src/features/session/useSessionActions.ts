import { storeToRefs } from "pinia";
import { useSessionStore } from "./sessionStore";
import { normalizedClientErrorCode } from "./sessionErrors";
import type { LatencyProbeResult } from "./sessionTypes";
import type { MessageHandlers } from "./messageRouter";

/** Outgoing commands and everything that waits on a reply: command completion, latency probes, chat,
 *  poke, away and whisper. Reads the session store directly. The pending maps are returned so the
 *  message router (still one switch until Step V6.2) can settle them. */
export interface RoomActionsDeps {
  protocolErrorMessage: (code: string, fallback: string) => string;
}

export function useSessionActions(deps: RoomActionsDeps) {
  const session = useSessionStore();
  const { ws, whisperActive } = storeToRefs(session);
  const { state, chatMessages, whisperTargetIds } = session;
  let latencyProbeSequence = 0;
  const pendingLatencyProbes = new Map<string, { startedAt: number; resolve: (result: LatencyProbeResult | null) => void; timer: ReturnType<typeof setTimeout> }>();
  let commandSequence = 0;
  const pendingCommands = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  function sendCmd(type: string, payload: Record<string, unknown> = {}, requestId = ""): void {
    if (ws.value?.readyState === WebSocket.OPEN) ws.value.send(JSON.stringify({ type, payload, ...(requestId ? { requestId } : {}) }));
  }

  function sendCommandAndWait(type: string, payload: Record<string, unknown>, timeoutMs = 8_000): Promise<void> {
    if (ws.value?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("语音连接尚未就绪"));
    const requestId = `command-${Date.now().toString(36)}-${(commandSequence++).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCommands.delete(requestId);
        reject(new Error("操作超时，请稍后重试"));
      }, timeoutMs);
      pendingCommands.set(requestId, { resolve, reject, timer });
      sendCmd(type, payload, requestId);
    });
  }

  function switchChannel(channelId: string, password = ""): void {
    state.error = "";
    state.errorCode = "";
    state.channelSwitchedChannelId = "";
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

  function sendTextMessage(message: string, targetId = ""): void {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 500) return;
    sendCmd("sendTextMessage", { message: trimmed });
    chatMessages.push({
      id: `self-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      scope: "channel",
      ...(targetId ? { targetId } : {}),
      senderId: state.tsClientId,
      invokerName: "你",
      message: trimmed,
      timestamp: Date.now(),
      isSelf: true,
    });
  }

  function sendServerMessage(message: string): void {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 500) return;
    sendCmd("sendServerMessage", { message: trimmed });
    chatMessages.push({ id: `self-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, scope: "server", senderId: state.tsClientId, invokerName: "你", message: trimmed, timestamp: Date.now(), isSelf: true });
  }

  function sendPrivateMessage(clientId: number, message: string, targetId = ""): void {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 500) return;
    sendCmd("sendPrivateMessage", { clientId, message: trimmed });
    chatMessages.push({ id: `self-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, scope: "private", targetId, conversationId: String(clientId), senderId: state.tsClientId, invokerName: "你", message: trimmed, timestamp: Date.now(), isSelf: true });
  }

  function sendPoke(clientId: number, message = ""): void {
    sendCmd("poke", { clientId, message: message.trim().slice(0, 200) });
  }

  function setAway(away: boolean, message = ""): void {
    sendCmd("setAway", { away, message: message.trim().slice(0, 200) });
  }

  function setWhisperTargets(clientIds: number[]): void {
    const targets = [...new Set(clientIds)].filter((clientId) => Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== state.tsClientId).slice(0, 8);
    whisperTargetIds.clear();
    for (const clientId of targets) whisperTargetIds.add(clientId);
    if (!targets.length) whisperActive.value = false;
    sendCmd("setWhisperTargets", { targetIds: targets });
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
        if (typeof clientId === "number" && Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== state.tsClientId) whisperTargetIds.add(clientId);
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
      state.error = deps.protocolErrorMessage(state.errorCode, String(msg.error?.message || msg.message || "操作失败"));
      {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        const pending = requestId ? pendingCommands.get(requestId) : undefined;
        if (pending) {
          clearTimeout(pending.timer);
          pendingCommands.delete(requestId);
          const error = new Error(state.error);
          Object.assign(error, { code: state.errorCode });
          pending.reject(error);
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
