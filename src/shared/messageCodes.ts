/**
 * Catalog of the codes the gateway puts on the wire for user-visible conditions
 * (docs/design/i18n-plan.md, Track I2). The gateway never translates: a frame
 * carries a stable `code`, optional `params`, and an English `message` that only
 * serves logs and old cached tabs. The browser renders `err_<CODE>` itself.
 *
 * Each code lists the param names it may carry. Values are strings or numbers.
 */

export type MessageParamValue = string | number;
export type MessageParams = Record<string, MessageParamValue>;

type NoParams = Record<never, never>;
type DetailParam = { detail?: string };

/** Protocol and validation errors answered with `{ type: "error" }`. */
const PROTOCOL_CODES = {
  INVALID_JSON: {} as NoParams,
  INVALID_MESSAGE: {} as NoParams,
  INVALID_REQUEST_ID: {} as NoParams,
  UNKNOWN_MESSAGE_TYPE: {} as NoParams,
  INVALID_PAYLOAD: {} as NoParams,
  INVALID_CHANNEL_ID: {} as NoParams,
  INVALID_CHANNEL_PASSWORD: {} as NoParams,
  INVALID_CLIENT_ID: {} as NoParams,
  INVALID_TEXT_MESSAGE: {} as NoParams,
  INVALID_POKE_MESSAGE: {} as NoParams,
  INVALID_AWAY_STATUS: {} as NoParams,
  INVALID_WHISPER_TARGETS: {} as NoParams,
  INVALID_WHISPER_STATE: {} as NoParams,
  INVALID_MICROPHONE_STATE: {} as NoParams,
  INVALID_ACCOMPANIMENT_STATE: {} as NoParams,
  INVALID_MEMBER_VOLUME: {} as NoParams,
  INVALID_LATENCY_PROBE: {} as NoParams,
  INVALID_AUDIO_FRAME: {} as NoParams,
  WEBRTC_DISABLED: {} as NoParams,
  SESSION_NOT_READY: {} as NoParams,
};

/** Operation errors answered with `{ type: "error" }` after a command ran. */
const OPERATION_CODES = {
  CHANNEL_NOT_FOUND: {} as NoParams,
  CHANNEL_SWITCH_FAILED: {} as NoParams,
  OPERATION_FAILED: {} as NoParams,
  CANNOT_MOVE_SELF: {} as NoParams,
  CLIENT_NOT_FOUND: {} as NoParams,
  NO_WHISPER_TARGETS: {} as NoParams,
  PERMISSION_DENIED: {} as NoParams,
  CHANNEL_PASSWORD_REQUIRED: {} as NoParams,
  CHANNEL_FULL: {} as NoParams,
  ALREADY_IN_CHANNEL: {} as NoParams,
  CLIENT_VERSION_OUTDATED: {} as NoParams,
  FLOOD_PROTECTION: {} as NoParams,
  BANNED: {} as NoParams,
  CONNECTION_INITIALISATION_FAILED: {} as NoParams,
};

/** Screen share errors: validation (`error` frames) and `screenShareError` frames. */
const SCREEN_SHARE_CODES = {
  INVALID_SCREEN_SHARE_REQUEST: {} as NoParams,
  INVALID_SCREEN_SHARE_NAME: {} as NoParams,
  INVALID_SCREEN_SHARE_STREAM: {} as NoParams,
  INVALID_SCREEN_SHARE_PEER: {} as NoParams,
  INVALID_SCREEN_SHARE_SIGNAL: {} as NoParams,
  INVALID_SCREEN_SHARE_AUDIO: {} as NoParams,
  UNKNOWN_SCREEN_SHARE_MESSAGE: {} as NoParams,
  SCREEN_SHARE_ALREADY_ACTIVE: {} as NoParams,
  SCREEN_SHARE_NOT_FOUND: {} as NoParams,
  SCREEN_SHARE_TARGET_MISMATCH: {} as NoParams,
  SCREEN_SHARE_NOT_OWNER: {} as NoParams,
  SCREEN_SHARE_OWNER_CANNOT_JOIN: {} as NoParams,
  SCREEN_SHARE_SIGNAL_FORBIDDEN: {} as NoParams,
  SCREEN_SHARE_SOURCE_UNAVAILABLE: {} as NoParams,
  SCREEN_SHARE_INVALID_SIGNAL: {} as NoParams,
  SCREEN_SHARE_SIGNAL_FAILED: {} as DetailParam,
  SCREEN_SHARE_PEER_NOT_FOUND: {} as NoParams,
  SCREEN_SHARE_JOIN_FAILED: {} as DetailParam,
  SCREEN_SHARE_NATIVE_PUBLISHER_STOPPED: {} as NoParams,
};

export type MessageCatalog = typeof PROTOCOL_CODES & typeof OPERATION_CODES & typeof SCREEN_SHARE_CODES;
export type MessageCode = keyof MessageCatalog;
export type ProtocolCode = keyof typeof PROTOCOL_CODES;
export type MessageParamsFor<C extends MessageCode> = MessageCatalog[C];

export const MESSAGE_CODES: readonly MessageCode[] = Object.keys({
  ...PROTOCOL_CODES,
  ...OPERATION_CODES,
  ...SCREEN_SHARE_CODES,
}) as MessageCode[];

const KNOWN_CODES: ReadonlySet<string> = new Set(MESSAGE_CODES);

export function isMessageCode(value: unknown): value is MessageCode {
  return typeof value === "string" && KNOWN_CODES.has(value);
}
