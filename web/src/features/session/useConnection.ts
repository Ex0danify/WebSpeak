import { storeToRefs } from "pinia";
import { useSessionStore } from "./sessionStore";
import {
  CONNECTION_FAILURE_MESSAGES,
  NICKNAME_LENGTH_MESSAGE,
  NICKNAME_LENGTH_SIGNATURE,
  normalizedClientErrorCode,
  safeClientErrorCode,
  safeClientErrorDetail,
} from "./sessionErrors";
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
  setMicrophoneError: (error: unknown) => string;
  startWebRtcTransport: (sequence: number, socket: WebSocket) => Promise<void>;
  sendScreenShareMessage: (payload: Record<string, unknown>) => void;
  isMicrophoneMuted: () => boolean;
  clearMemberVolumes: () => void;
}

/** Connection lifecycle: join ticket, socket open/close, reconnect, error-code mapping and disconnect.
 *  `disconnect` reaches every other module's teardown through `deps` (late-bound, V-D2), in the
 *  order the old function called them. Reads the session store directly; audio state comes in through `deps`. */
export function useConnection(deps: ConnectionDeps) {
  const session = useSessionStore();
  const { ws, whisperActive } = storeToRefs(session);
  const { state, members, channels, chatMessages, serverEvents, whisperTargetIds } = session;
  let connectionSequence = 0;
  // Set once connectionFailed has already put a message and a code in front of the person for this
  // attempt (F23): the gateway closes the socket right after such a failure, and onclose must not
  // raise the same failure again from the close code once they have dismissed it (a cancelled
  // password dialog must not come back). Reset for every new attempt.
  let failureAlreadyReported = false;
  let lastConnection: { target: string; channel: string; nickname: string; serverPassword: string; identity?: string; rememberIdentity: boolean; accelerated: boolean; accelerationRelayId: string } | null = null;

  function connect(target: string, channel: string, nickname: string, serverPassword = "", identity = "", rememberIdentity = false, inviteToken = "", accelerated = false, accelerationRelayId = ""): void {
    disconnect(true);
    lastConnection = { target, channel, nickname, serverPassword, ...(identity ? { identity } : {}), rememberIdentity, accelerated, accelerationRelayId };
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

  async function openTicketedConnection(sequence: number, target: string, channel: string, nickname: string, serverPassword: string, inviteToken: string, accelerated: boolean): Promise<void> {
    try {
      const response = await fetch("/api/join-ticket", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ target, nickname, channel, serverPassword, ...(inviteToken ? { invite: inviteToken } : {}), ...(accelerated ? { accelerated: true, ...(lastConnection?.accelerationRelayId ? { accelerationRelayId: lastConnection.accelerationRelayId } : {}) } : {}), ...(lastConnection?.rememberIdentity && lastConnection.identity ? { identity: lastConnection.identity } : {}), ...(lastConnection?.rememberIdentity ? { rememberIdentity: true } : {}) }),
      });
      const result = await response.json().catch(() => ({})) as { ticket?: unknown; code?: unknown; detail?: unknown };
      if (!response.ok || typeof result.ticket !== "string") {
        const failureCode = normalizedClientErrorCode(result.code);
        const failure = new Error(joinTicketReason(failureCode, result.detail));
        Object.assign(failure, { code: failureCode });
        throw failure;
      }
      if (sequence !== connectionSequence) return;
      openVoiceSocket(sequence, result.ticket);
    } catch (error: unknown) {
      if (sequence !== connectionSequence) return;
      state.connecting = false;
      const errorRecord = error && typeof error === "object" ? error as { code?: unknown } : {};
      state.errorCode = normalizedClientErrorCode(errorRecord.code, "REQUEST_FAILED");
      state.error = error instanceof Error ? error.message : connectionFailureMessage(state.errorCode);
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
      deps.rejectPendingCommands(new Error("语音连接已关闭"));
      state.connected = false;
      state.connecting = false;
      state.reconnecting = false;
      // Prefer the close code over the generic WebSocket error event. The
      // gateway uses a dedicated code when a remembered identity is already
      // active in another browser page. Code 1000 is otherwise a plain leave
      // the person asked for and stays silent, except when the reason says an
      // administrator ended the session instead (F21): that is not something
      // the person did, so it gets the same notice every other refusal shows.
      // A connectionFailed message already reported this attempt's failure
      // (F23): the close that follows it must not raise the same failure
      // again once the person has dismissed it, or a cancelled password
      // dialog would reopen on its own.
      if ((event.code !== 1000 || event.reason === "admin-terminated") && !state.reconnectFailed && !state.errorCode && !failureAlreadyReported) {
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
      // The following close event contains the actionable close code. Do not
      // overwrite it with a generic browser WebSocket error first.
    };
  }

  function joinTicketReason(code: string, detail?: unknown): string {
    const messages: Record<string, string> = {
      ORIGIN_REJECTED: "请求来源不受信任，请从正确的网站入口重新打开",
      NOT_INITIALIZED: "WebSpeak 尚未完成配置，请联系管理员",
      RATE_LIMITED: "请求过于频繁，请稍后重试",
      TARGET_NOT_ALLOWED: "此 TeamSpeak 服务器地址不允许连接",
      ACCELERATION_UNAVAILABLE: "当前中继加速不可用，请关闭加速或联系管理员",
      INVALID_NICKNAME: "请输入有效的昵称",
      INVITE_INVALID: "邀请链接已失效或已被撤销",
    };
    const normalized = normalizedClientErrorCode(code);
    return messages[normalized] ?? connectionFailureMessage(normalized, detail);
  }

  // 网关关闭码 → 前端可解释错误码的映射：4000-4003 是网关/会话级，4004/4005 是
  // TeamSpeak 拒绝与身份冲突，4006 是中继加速，1001 是网关主动重启（F17），
  // 1006/1011 是传输级掉线，绝不能被误当成 TeamSpeak 服务器拒绝。
  /**
   * Gateway close codes. 4000-4003 are gateway/session level, 4004/4005 are a
   * TeamSpeak rejection and an identity conflict, 4006 is the acceleration relay,
   * 1001 is the gateway going down on purpose (F17), and 1006 is a
   * transport-level drop that must not be blamed on TeamSpeak.
   */
  const GATEWAY_CLOSE_CODE_CODES: Record<number, string> = {
    4000: "CONNECTION_FAILED",
    4001: "JOIN_TICKET_REQUIRED",
    4002: "INVALID_TARGET",
    4003: "IDENTITY_REJECTED",
    4004: "SERVER_REJECTED",
    4005: "IDENTITY_IN_USE",
    4006: "ACCELERATION_UNAVAILABLE",
    1001: "GATEWAY_RESTARTING",
    1006: "GATEWAY_NETWORK_LOST",
    1011: "GATEWAY_SESSION_ENDED",
  };

  function closeErrorCode(code: number, reason = ""): string {
    const closeCode = normalizedClientErrorCode(reason, "");
    // The gateway repeats the failure code in the close reason. Trust it when the
    // browser can explain that code, otherwise fall back to the numeric close code
    // so even a silent close maps to an actionable message.
    if (closeCode && CONNECTION_FAILURE_MESSAGES[closeCode]) return closeCode;
    return GATEWAY_CLOSE_CODE_CODES[code] ?? "CONNECTION_FAILED";
  }

  function connectionFailureMessage(code: string, detail?: unknown): string {
    const messages = CONNECTION_FAILURE_MESSAGES;
    const normalized = normalizedClientErrorCode(code);
    if (messages[normalized]) return messages[normalized];
    const safeCode = safeClientErrorCode(normalized);
    const safeDetail = safeClientErrorDetail(detail);
    // The gateway classifies a refused nickname before it reaches the browser,
    // but translate the raw TeamSpeak signature too: a nickname problem must
    // never end up as the generic "check your network" fallback.
    if (safeDetail && NICKNAME_LENGTH_SIGNATURE.test(safeDetail)) return NICKNAME_LENGTH_MESSAGE;
    return `TeamSpeak 连接失败（错误代码：${safeCode}）${safeDetail ? `：${safeDetail}` : ""}，请检查输入、网络或服务器状态`;
  }

  function closeReason(code: number, reason = ""): string {
    const failureCode = closeErrorCode(code, reason);
    if (code === 4004 && failureCode === "SERVER_REJECTED") return "服务器当前已满或拒绝了连接，请稍后重试";
    return connectionFailureMessage(failureCode);
  }

  function disconnect(preserveConnection = false): void {
    connectionSequence++;
    deps.clearLatencyProbes();
    deps.rejectPendingCommands(new Error("语音连接已关闭"));
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
    connect(lastConnection.target, lastConnection.channel, lastConnection.nickname, lastConnection.serverPassword, lastConnection.rememberIdentity ? deps.identityMaterial.value || lastConnection.identity : "", lastConnection.rememberIdentity, "", lastConnection.accelerated, lastConnection.accelerationRelayId);
  }

  function clearError(): void {
    state.error = "";
    state.errorCode = "";
  }

  function protocolErrorMessage(code: string, fallback: string): string {
    const messages: Record<string, string> = {
      INVALID_JSON: "消息格式无效",
      INVALID_MESSAGE: "消息格式无效",
      INVALID_REQUEST_ID: "请求标识无效",
      UNKNOWN_MESSAGE_TYPE: "不支持的操作",
      INVALID_PAYLOAD: "操作参数无效",
      INVALID_CHANNEL_ID: "频道标识无效",
      INVALID_CHANNEL_PASSWORD: "频道密码无效",
      INVALID_CLIENT_ID: "成员标识无效",
      INVALID_TEXT_MESSAGE: "文字消息无效",
      INVALID_POKE_MESSAGE: "戳一戳消息无效",
      INVALID_AWAY_STATUS: "离开状态无效",
      INVALID_AUDIO_FRAME: "音频帧格式无效",
      INVALID_MEMBER_VOLUME: "成员音量无效",
      INVALID_WHISPER_TARGETS: "私语目标无效",
      INVALID_WHISPER_STATE: "私语状态无效",
      NO_WHISPER_TARGETS: "请先选择私语目标",
      SESSION_NOT_READY: "TeamSpeak 会话尚未就绪",
      CHANNEL_SWITCH_FAILED: "频道切换失败",
      CHANNEL_PASSWORD_REQUIRED: "该频道需要密码",
      CHANNEL_FULL: "该频道已满",
      CANNOT_MOVE_SELF: "不能移动自己的客户端",
      CHANNEL_NOT_FOUND: "目标频道不可用",
      NICKNAME_IN_USE: "该昵称已被占用，请更换昵称",
      CLIENT_VERSION_OUTDATED: "客户端版本过旧，服务器拒绝了该操作",
      FLOOD_PROTECTION: "操作过于频繁，请稍后重试",
      BANNED: "你已被该服务器封禁",
      KICKED: "你已被服务器移出",
      PERMISSION_DENIED: "你没有执行此操作的权限",
      CLIENT_NOT_FOUND: "成员已离线",
      OPERATION_FAILED: "操作失败",
    };
    const normalized = normalizedClientErrorCode(code, "OPERATION_FAILED");
    if (messages[normalized]) return messages[normalized];
    const safeCode = safeClientErrorCode(normalized);
    const safeFallback = safeClientErrorDetail(fallback);
    return `操作失败（错误代码：${safeCode}）${safeFallback ? `：${safeFallback}` : ""}`;
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
      // The mute preference is local to the browser, while TeamSpeak shows
      // the gateway's own client_input_muted flag to other clients. Send it
      // as soon as the session is ready so a muted reconnect is visible to
      // native TeamSpeak users even before WebRTC negotiation completes.
      deps.sendCmd("setMicrophoneMuted", { muted: deps.isMicrophoneMuted() });
      setScreenShareIceServers(msg.screenShareIceServers);
      deps.applyWhisperState(msg.whisperTargetIds, msg.whisperActive);
      if (Array.isArray(msg.members)) {
        members.length = 0;
        for (const member of msg.members) {
          members.push({ ...member, isSelf: Number(member.id) === state.tsClientId });
        }
        deps.syncKnownMemberVolumes();
      }
      serverEvents.length = 0;
      if (Array.isArray(msg.serverEventLog)) serverEvents.push(...msg.serverEventLog);
      if (typeof msg.identity === "string" && msg.identity.length <= 8192) {
        deps.identityMaterial.value = msg.identity;
        if (lastConnection) lastConnection.identity = msg.identity;
      }
      if (wasReconnecting) {
        const start = msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined"
          ? (ws.value ? deps.startWebRtcTransport(connectionSequence, ws.value) : Promise.resolve())
          : deps.ensureMicrophone();
        // A failed microphone must not look like a failed connection: record it
        // as an audio diagnostic so the room stays visible with a clear reason.
        start.catch((error: unknown) => { deps.setMicrophoneError(error); });
      } else if (msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined" && ws.value) {
        void deps.startWebRtcTransport(connectionSequence, ws.value).catch((error: unknown) => { deps.setMicrophoneError(error); });
      } else {
        void deps.ensureMicrophone().catch((error: unknown) => { deps.setMicrophoneError(error); });
      }
      deps.sendScreenShareMessage({ type: "screenShareList" });
    },
    disconnected: (msg) => {
      state.connected = false;
      state.connecting = false;
      state.reconnecting = Boolean(msg.recoverable !== false);
      state.reconnectFailed = false;
      if (!state.reconnecting) state.error = "TeamSpeak 连接已断开";
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
    reconnected: (msg) => {
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
      // This is the first connection attempt, not a failed reconnect. Keep
      // the user on the welcome form instead of showing an empty voice room.
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
