import { storeToRefs } from "pinia";
import { useSessionStore } from "./sessionStore";
import { LocalizedError, text, type LocalizedText } from "@/shared/i18n/localizedText";
import { normalizedClientErrorCode } from "./sessionErrors";
import { closeErrorCode, closeReason, connectionFailureMessage, joinTicketReason, protocolErrorMessage } from "./connectionMessages";
import { MAX_SERVER_EVENTS, pushBounded, readAvatar } from "./sessionLimits";
import { setScreenShareIceServers } from "./iceServers";
import type { MessageHandlers } from "./messageRouter";

export interface ConnectionDeps {
  audioPreferencesReady: Promise<void>;
  identityMaterial: { value: string };
  handleMessage: (msg: unknown) => void;
  handleAudioFrame: (frame: Uint8Array) => void;
  clearLatencyProbes: () => void;
  rejectPendingCommands: (error: Error) => void;
  stopMicrophone: () => void;
  clearMicrophoneError: () => void;
  clearAudioNotice: () => void;
  stopScreenShareTransport: (clearStreams: boolean) => void;
  stopWebRtcTransport: () => void;
  resetDownlink: () => void;
  sendCmd: (type: string, payload?: Record<string, unknown>) => void;
  applyWhisperState: (targetIds: unknown, active: unknown) => void;
  syncKnownMemberVolumes: () => void;
  ensureMicrophone: () => Promise<void>;
  setMicrophoneError: (error: unknown) => LocalizedText;
  startWebRtcTransport: (sequence: number, socket: WebSocket) => Promise<void>;
  sendScreenShareMessage: (payload: Record<string, unknown>) => void;
  isMicrophoneMuted: () => boolean;
  clearMemberVolumes: () => void;
}

/** Join ticket, socket open and close, reconnect, error-code mapping and disconnect. `disconnect` reaches the other modules'
 *  teardown through `deps` (late-bound). Reads the session store directly, audio state comes in through `deps`. */
export function useConnection(deps: ConnectionDeps) {
  const session = useSessionStore();
  const { ws, whisperActive } = storeToRefs(session);
  const { state, members, channels, chatMessages, serverEvents, whisperTargetIds } = session;
  let connectionSequence = 0;
  // Set once connectionFailed has shown the person a message and code for this attempt. The gateway closes the socket right
  // after such a failure and onclose must not raise it again from the close code (a cancelled password dialog would come back).
  // Reset per attempt.
  let failureAlreadyReported = false;
  let lastConnection: {
    target: string;
    channel: string;
    nickname: string;
    serverPassword: string;
    identity?: string;
    rememberIdentity: boolean;
    accelerated: boolean;
    accelerationRelayId: string;
  } | null = null;

  function connect(
    target: string,
    channel: string,
    nickname: string,
    serverPassword = "",
    identity = "",
    rememberIdentity = false,
    inviteToken = "",
    accelerated = false,
    accelerationRelayId = "",
  ): void {
    disconnect(true);
    lastConnection = {
      target,
      channel,
      nickname,
      serverPassword,
      ...(identity ? { identity } : {}),
      rememberIdentity,
      accelerated,
      accelerationRelayId,
    };
    deps.identityMaterial.value = identity;
    const sequence = ++connectionSequence;
    failureAlreadyReported = false;
    state.error = "";
    state.errorCode = "";
    // Audio diagnostics belong to the previous session, never to the new one.
    deps.clearMicrophoneError();
    deps.clearAudioNotice();
    state.connecting = true;
    state.reconnecting = false;
    state.reconnectAttempt = 0;
    state.reconnectFailed = false;
    void deps.audioPreferencesReady.then(() => {
      if (sequence !== connectionSequence) return;
      void openTicketedConnection(sequence, target, channel, nickname, serverPassword, inviteToken, accelerated);
    });
  }

  async function openTicketedConnection(
    sequence: number,
    target: string,
    channel: string,
    nickname: string,
    serverPassword: string,
    inviteToken: string,
    accelerated: boolean,
  ): Promise<void> {
    try {
      const response = await fetch("/api/join-ticket", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          target,
          nickname,
          channel,
          serverPassword,
          ...(inviteToken ? { invite: inviteToken } : {}),
          ...(accelerated
            ? {
                accelerated: true,
                ...(lastConnection?.accelerationRelayId ? { accelerationRelayId: lastConnection.accelerationRelayId } : {}),
              }
            : {}),
          ...(lastConnection?.rememberIdentity && lastConnection.identity ? { identity: lastConnection.identity } : {}),
          ...(lastConnection?.rememberIdentity ? { rememberIdentity: true } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { ticket?: unknown; code?: unknown; detail?: unknown };
      if (!response.ok || typeof result.ticket !== "string") {
        const failureCode = normalizedClientErrorCode(result.code);
        const reason = joinTicketReason(failureCode, result.detail);
        throw new LocalizedError(reason, failureCode);
      }
      if (sequence !== connectionSequence) return;
      openVoiceSocket(sequence, result.ticket);
    } catch (error: unknown) {
      if (sequence !== connectionSequence) return;
      state.connecting = false;
      const code = error instanceof LocalizedError ? error.code : undefined;
      state.errorCode = normalizedClientErrorCode(code, "REQUEST_FAILED");
      state.error =
        error instanceof LocalizedError ? error.text : error instanceof Error ? error.message : connectionFailureMessage(state.errorCode);
    }
  }

  function openVoiceSocket(sequence: number, ticket: string): void {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${proto}//${location.host}/ws/voice?ticket=${encodeURIComponent(ticket)}`);
    socket.binaryType = "arraybuffer";
    ws.value = socket;
    socket.onopen = () => {
      if (sequence !== connectionSequence) {
        socket.close(1000);
        return;
      }
    };
    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          deps.handleMessage(JSON.parse(event.data));
        } catch {
          // Ignore malformed control frames.
        }
      } else {
        deps.handleAudioFrame(new Uint8Array(event.data));
      }
    };
    socket.onclose = (event) => {
      if (sequence !== connectionSequence) return;
      deps.clearLatencyProbes();
      deps.rejectPendingCommands(new LocalizedError(text("voiceConnectionClosed"), "VOICE_CONNECTION_CLOSED"));
      state.connected = false;
      state.connecting = false;
      state.reconnecting = false;
      // Prefer the close code over the generic WebSocket error event. The gateway uses a dedicated code when a remembered
      // identity is active in another page. Code 1000 is a plain leave and stays silent, unless the reason says an admin ended
      // the session.
      if (
        (event.code !== 1000 || event.reason === "admin-terminated") &&
        !state.reconnectFailed &&
        !state.errorCode &&
        !failureAlreadyReported
      ) {
        state.errorCode = closeErrorCode(event.code, event.reason);
        state.error = closeReason(event.code, event.reason);
      }
      deps.stopWebRtcTransport();
      deps.stopMicrophone();
      deps.clearMicrophoneError();
      deps.clearAudioNotice();
      whisperTargetIds.clear();
      whisperActive.value = false;
    };
    socket.onerror = () => {
      // The close event that follows has the actionable code, so don't overwrite it with the generic browser error.
    };
  }

  function disconnect(preserveConnection = false): void {
    connectionSequence++;
    deps.clearLatencyProbes();
    deps.rejectPendingCommands(new LocalizedError(text("voiceConnectionClosed"), "VOICE_CONNECTION_CLOSED"));
    const keepRememberedIdentity = lastConnection?.rememberIdentity === true;
    if (!preserveConnection) lastConnection = null;
    deps.stopMicrophone();
    deps.clearMicrophoneError();
    deps.clearAudioNotice();
    deps.stopScreenShareTransport(!preserveConnection);
    const socket = ws.value;
    ws.value = null;
    deps.stopWebRtcTransport();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000);
    state.connected = false;
    state.connecting = false;
    state.reconnecting = false;
    state.reconnectAttempt = 0;
    state.reconnectFailed = false;
    state.tsClientId = 0;
    state.errorCode = "";
    state.channelSwitchedChannelId = "";
    if (!keepRememberedIdentity) deps.identityMaterial.value = "";
    members.length = 0;
    channels.length = 0;
    chatMessages.length = 0;
    deps.resetDownlink();
    whisperTargetIds.clear();
    whisperActive.value = false;
    deps.clearMemberVolumes();
  }

  function reconnectNow(): void {
    if (!lastConnection || state.connecting) return;
    connect(
      lastConnection.target,
      lastConnection.channel,
      lastConnection.nickname,
      lastConnection.serverPassword,
      lastConnection.rememberIdentity ? deps.identityMaterial.value || lastConnection.identity : "",
      lastConnection.rememberIdentity,
      "",
      lastConnection.accelerated,
      lastConnection.accelerationRelayId,
    );
  }

  function clearError(): void {
    state.error = "";
    state.errorCode = "";
  }

  const handlers: MessageHandlers = {
    connected: (msg) => {
      const wasReconnecting = state.reconnecting;
      state.connected = true;
      state.connecting = false;
      state.reconnecting = false;
      state.reconnectAttempt = 0;
      state.reconnectFailed = false;
      state.error = "";
      state.errorCode = "";
      state.channelSwitchedChannelId = "";
      state.tsClientId = Number(msg.tsClientId) || 0;
      // The mute preference is local to the browser, TeamSpeak shows the gateway's client_input_muted flag to others.
      // Send it as soon as the session is ready so a muted reconnect shows for native users before WebRTC negotiates.
      deps.sendCmd("setMicrophoneMuted", { muted: deps.isMicrophoneMuted() });
      setScreenShareIceServers(msg.screenShareIceServers);
      deps.applyWhisperState(msg.whisperTargetIds, msg.whisperActive);
      if (Array.isArray(msg.members)) {
        members.length = 0;
        for (const member of msg.members) {
          members.push({ ...member, avatar: readAvatar(member.avatar), isSelf: Number(member.id) === state.tsClientId });
        }
        deps.syncKnownMemberVolumes();
      }
      serverEvents.length = 0;
      if (Array.isArray(msg.serverEventLog)) pushBounded(serverEvents, MAX_SERVER_EVENTS, ...msg.serverEventLog);
      if (typeof msg.identity === "string" && msg.identity.length <= 8192) {
        deps.identityMaterial.value = msg.identity;
        if (lastConnection) lastConnection.identity = msg.identity;
      }
      if (wasReconnecting) {
        const start =
          msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined"
            ? ws.value
              ? deps.startWebRtcTransport(connectionSequence, ws.value)
              : Promise.resolve()
            : deps.ensureMicrophone();
        // A failed microphone must not look like a failed connection, so it becomes an audio diagnostic and the room stays
        // visible.
        start.catch((error: unknown) => {
          deps.setMicrophoneError(error);
        });
      } else if (msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined" && ws.value) {
        void deps.startWebRtcTransport(connectionSequence, ws.value).catch((error: unknown) => {
          deps.setMicrophoneError(error);
        });
      } else {
        void deps.ensureMicrophone().catch((error: unknown) => {
          deps.setMicrophoneError(error);
        });
      }
      deps.sendScreenShareMessage({ type: "screenShareList" });
    },
    disconnected: (msg) => {
      state.connected = false;
      state.connecting = false;
      state.reconnecting = Boolean(msg.recoverable !== false);
      state.reconnectFailed = false;
      if (!state.reconnecting) state.error = text("connectionClosedTeamSpeak");
      deps.stopWebRtcTransport();
      deps.stopScreenShareTransport(false);
      deps.stopMicrophone();
      whisperTargetIds.clear();
      whisperActive.value = false;
    },
    reconnecting: (msg) => {
      state.connected = false;
      state.connecting = false;
      state.reconnecting = true;
      state.reconnectFailed = false;
      state.reconnectAttempt = Number(msg.attempt) || state.reconnectAttempt + 1;
      deps.stopWebRtcTransport();
      deps.stopScreenShareTransport(false);
      deps.stopMicrophone();
      whisperTargetIds.clear();
      whisperActive.value = false;
    },
    reconnected: () => {
      state.reconnecting = false;
      state.reconnectFailed = false;
    },
    reconnectFailed: (msg) => {
      state.connected = false;
      state.connecting = false;
      state.reconnecting = false;
      state.reconnectFailed = true;
      state.errorCode = normalizedClientErrorCode(msg.code);
      state.error = connectionFailureMessage(state.errorCode, msg.detail);
      deps.stopScreenShareTransport(false);
      whisperTargetIds.clear();
      whisperActive.value = false;
    },
    connectionFailed: (msg) => {
      state.connected = false;
      state.connecting = false;
      state.reconnecting = false;
      // First connection attempt, not a failed reconnect, so stay on the welcome form instead of an empty voice room.
      state.reconnectFailed = false;
      failureAlreadyReported = true;
      state.errorCode = normalizedClientErrorCode(msg.code);
      state.error = connectionFailureMessage(state.errorCode, msg.detail);
      deps.stopScreenShareTransport(false);
      whisperTargetIds.clear();
      whisperActive.value = false;
    },
  };

  return {
    handlers,
    connect,
    disconnect,
    reconnectNow,
    clearError,
    connectionFailureMessage,
    protocolErrorMessage,
    getConnectionSequence: () => connectionSequence,
    hasLastConnection: () => lastConnection !== null,
  };
}
