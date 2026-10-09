import type { ProtocolCode } from "../../../shared/messageCodes.js";
import { isRecord } from "../../../shared/typeGuards.js";

export interface ClientCommand {
  type: "switchChannel" | "moveClient" | "sendTextMessage" | "sendServerMessage" | "sendPrivateMessage" | "poke" | "setAway" | "setWhisperTargets" | "setWhisperActive" | "setMicrophoneMuted" | "setAccompanimentActive" | "setMemberVolume" | "latencyProbe";
  requestId?: string;
  payload: Record<string, unknown>;
}

export type ClientCommandResult = ClientCommand | { error: { code: ProtocolCode; message: string } };

export function parseClientCommand(raw: string): ClientCommandResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: { code: "INVALID_JSON", message: "Message is not valid JSON" } };
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    return { error: { code: "INVALID_MESSAGE", message: "Message type must not be empty" } };
  }
  if (value.requestId !== undefined && (typeof value.requestId !== "string" || value.requestId.length > 64)) {
    return { error: { code: "INVALID_REQUEST_ID", message: "Request id is invalid" } };
  }
  const supportedTypes = new Set(["switchChannel", "moveClient", "sendTextMessage", "sendServerMessage", "sendPrivateMessage", "poke", "setAway", "setWhisperTargets", "setWhisperActive", "setMicrophoneMuted", "setAccompanimentActive", "setMemberVolume", "latencyProbe"]);
  if (!supportedTypes.has(value.type)) {
    return { error: { code: "UNKNOWN_MESSAGE_TYPE", message: "Unsupported message type" } };
  }
  if (!isRecord(value.payload)) {
    return { error: { code: "INVALID_PAYLOAD", message: "Message payload is invalid" } };
  }
  if (value.type === "switchChannel" && (typeof value.payload.channelId !== "string" || !/^\d{1,20}$/.test(value.payload.channelId))) {
    return { error: { code: "INVALID_CHANNEL_ID", message: "Channel id is invalid" } };
  }
  if (value.type === "switchChannel" && value.payload.password !== undefined && (typeof value.payload.password !== "string" || value.payload.password.length > 512)) {
    return { error: { code: "INVALID_CHANNEL_PASSWORD", message: "Channel password is invalid" } };
  }
  if (value.type === "moveClient" && (typeof value.payload.clientId !== "number" || !Number.isInteger(value.payload.clientId) || value.payload.clientId <= 0 || value.payload.clientId > 65535)) {
    return { error: { code: "INVALID_CLIENT_ID", message: "Member id is invalid" } };
  }
  if (value.type === "moveClient" && (typeof value.payload.channelId !== "string" || !/^\d{1,20}$/.test(value.payload.channelId))) {
    return { error: { code: "INVALID_CHANNEL_ID", message: "Channel id is invalid" } };
  }
  if (value.type === "moveClient" && value.payload.password !== undefined && (typeof value.payload.password !== "string" || value.payload.password.length > 512)) {
    return { error: { code: "INVALID_CHANNEL_PASSWORD", message: "Channel password is invalid" } };
  }
  if (value.type === "sendTextMessage" && (typeof value.payload.message !== "string" || value.payload.message.length > 500)) {
    return { error: { code: "INVALID_TEXT_MESSAGE", message: "Text message is invalid" } };
  }
  if ((value.type === "sendServerMessage" || value.type === "sendPrivateMessage") && (typeof value.payload.message !== "string" || value.payload.message.length > 500)) {
    return { error: { code: "INVALID_TEXT_MESSAGE", message: "Text message is invalid" } };
  }
  if ((value.type === "sendPrivateMessage" || value.type === "poke") && (typeof value.payload.clientId !== "number" || !Number.isInteger(value.payload.clientId) || value.payload.clientId <= 0 || value.payload.clientId > 65535)) {
    return { error: { code: "INVALID_CLIENT_ID", message: "Member id is invalid" } };
  }
  if (value.type === "poke" && (typeof value.payload.message !== "string" || value.payload.message.length > 200)) {
    return { error: { code: "INVALID_POKE_MESSAGE", message: "Poke message is invalid" } };
  }
  if (value.type === "setAway" && (typeof value.payload.away !== "boolean" || (value.payload.message !== undefined && (typeof value.payload.message !== "string" || value.payload.message.length > 200)))) {
    return { error: { code: "INVALID_AWAY_STATUS", message: "Away status is invalid" } };
  }
  if (value.type === "setWhisperTargets") {
    const targetIds = value.payload.targetIds;
    if (!Array.isArray(targetIds) || targetIds.length > 8 || targetIds.some((clientId) => typeof clientId !== "number" || !Number.isInteger(clientId) || clientId <= 0 || clientId > 65535) || new Set(targetIds).size !== targetIds.length) {
      return { error: { code: "INVALID_WHISPER_TARGETS", message: "Whisper targets are invalid" } };
    }
  }
  if (value.type === "setWhisperActive" && typeof value.payload.active !== "boolean") {
    return { error: { code: "INVALID_WHISPER_STATE", message: "Whisper state is invalid" } };
  }
  if (value.type === "setMicrophoneMuted" && typeof value.payload.muted !== "boolean") {
    return { error: { code: "INVALID_MICROPHONE_STATE", message: "Microphone state is invalid" } };
  }
  if (value.type === "setAccompanimentActive" && typeof value.payload.active !== "boolean") {
    return { error: { code: "INVALID_ACCOMPANIMENT_STATE", message: "Accompaniment state is invalid" } };
  }
  if (value.type === "setMemberVolume" && (typeof value.payload.clientId !== "number" || !Number.isInteger(value.payload.clientId) || value.payload.clientId <= 0 || value.payload.clientId > 65535 || typeof value.payload.volume !== "number" || !Number.isFinite(value.payload.volume) || value.payload.volume < 0 || value.payload.volume > 4)) {
    return { error: { code: "INVALID_MEMBER_VOLUME", message: "Member volume is invalid" } };
  }
  if (value.type === "latencyProbe" && (typeof value.payload.sequence !== "string" || value.payload.sequence.length > 64)) {
    return { error: { code: "INVALID_LATENCY_PROBE", message: "Latency probe id is invalid" } };
  }
  return {
    type: value.type as ClientCommand["type"],
    ...(typeof value.requestId === "string" ? { requestId: value.requestId } : {}),
    payload: value.payload,
  };
}
