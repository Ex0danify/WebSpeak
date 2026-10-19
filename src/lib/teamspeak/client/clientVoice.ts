import type { SessionChannel } from "../session/channelTree.js";
import type { SessionServer } from "../session/serverInfo.js";
import type { VoicePacket } from "../transport/packetHandler.js";
import { maxPayloadBytes, PacketFlag, PacketType } from "../transport/packetTypes.js";

export const VoiceCodec = { opusVoice: 4, opusMusic: 5 } as const;

/** Who hears a group whisper. */
export const WhisperGroupType = { serverGroup: 0, channelGroup: 1, channelCommander: 2, allClients: 3 } as const;
export type WhisperGroupType = (typeof WhisperGroupType)[keyof typeof WhisperGroupType];

/** Which channels a group whisper reaches, seen from the sender's channel. */
export const WhisperGroupTarget = {
  allChannels: 0,
  currentChannel: 1,
  parentChannel: 2,
  allParentChannels: 3,
  channelFamily: 4,
  ancestorChannelFamily: 5,
  subChannels: 6,
} as const;
export type WhisperGroupTarget = (typeof WhisperGroupTarget)[keyof typeof WhisperGroupTarget];

export type WhisperTargets =
  | { clientIds?: readonly number[]; channelIds?: readonly bigint[] }
  | {
      group: WhisperGroupType;
      target: WhisperGroupTarget;
      /** Server or channel group id for those types, otherwise 0. */
      groupId?: bigint;
    };

/** Same limit as the old SDK, for clients and channels together. */
export const MAX_WHISPER_TARGETS = 32;

export interface VoiceEvent {
  type: "voice";
  clientId: number;
  codec: number;
  /** Empty when the speaker stopped. A view into the datagram, copy it to keep it. */
  data: Buffer;
  whisper: boolean;
}

// The packet handler puts the 2-byte voice id in front.
const VOICE_ID_BYTES = 2;
const MAX_BODY_BYTES = maxPayloadBytes("c2s") - VOICE_ID_BYTES;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

const isU16 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffff;
const isU64 = (value: bigint) => typeof value === "bigint" && value >= 0n && value <= U64_MAX;

function checkCodec(codec: number): void {
  if (!Number.isInteger(codec) || codec < 0 || codec > 0xff) throw new RangeError(`voice codec must be a u8, got ${codec}`);
}

function body(size: number, data: Uint8Array): Buffer {
  if (size + data.length > MAX_BODY_BYTES) throw new RangeError(`voice packet of ${size + data.length} bytes is over ${MAX_BODY_BYTES}`);
  const out = Buffer.allocUnsafe(size + data.length);
  out.set(data, size);
  return out;
}

/** `codec | data` */
export function buildVoiceBody(data: Uint8Array, codec: number): Buffer {
  checkCodec(codec);
  const out = body(1, data);
  out[0] = codec;
  return out;
}

export interface WhisperBody {
  body: Buffer;
  /** The group layout is told apart by the NewProtocol flag. */
  flags: number;
}

/**
 * List layout `codec | channelCount | clientCount | channelIds u64[] | clientIds u16[] | data`, group
 * layout `codec | groupType | groupTarget | groupId u64 | data`.
 */
export function buildWhisperBody(data: Uint8Array, targets: WhisperTargets, codec: number): WhisperBody {
  checkCodec(codec);
  if ("group" in targets) {
    const groupId = targets.groupId ?? 0n;
    if (!Object.values(WhisperGroupType).includes(targets.group)) throw new RangeError(`unknown whisper group type ${targets.group}`);
    if (!Object.values(WhisperGroupTarget).includes(targets.target)) throw new RangeError(`unknown whisper group target ${targets.target}`);
    if (!isU64(groupId)) throw new RangeError("whisper group id must be a u64");
    const out = body(11, data);
    out[0] = codec;
    out[1] = targets.group;
    out[2] = targets.target;
    out.writeBigUInt64BE(groupId, 3);
    return { body: out, flags: PacketFlag.newProtocol };
  }
  const channelIds = targets.channelIds ?? [];
  const clientIds = targets.clientIds ?? [];
  const count = channelIds.length + clientIds.length;
  if (count === 0) throw new RangeError("whisper needs at least one target");
  if (count > MAX_WHISPER_TARGETS) throw new RangeError(`whisper takes at most ${MAX_WHISPER_TARGETS} targets, got ${count}`);
  if (!channelIds.every(isU64)) throw new RangeError("whisper channel ids must be u64");
  if (!clientIds.every(isU16)) throw new RangeError("whisper client ids must be u16");
  const out = body(3 + channelIds.length * 8 + clientIds.length * 2, data);
  out[0] = codec;
  out[1] = channelIds.length;
  out[2] = clientIds.length;
  let offset = 3;
  for (const id of channelIds) offset = out.writeBigUInt64BE(id, offset);
  for (const id of clientIds) offset = out.writeUInt16BE(id, offset);
  return { body: out, flags: 0 };
}

/** Voice and whisper from the server: `voiceId | clientId | codec | data`. */
export function parseServerVoice(packet: VoicePacket): VoiceEvent | undefined {
  const { payload } = packet;
  if (payload.length < 5) return undefined;
  return {
    type: "voice",
    clientId: payload.readUInt16BE(2),
    codec: payload[4],
    data: payload.subarray(5),
    whisper: packet.type === PacketType.voiceWhisper,
  };
}

/** `auto` follows the server: mode 0 leaves it to our channel, 1 turns it off, 2 forces it on. */
export type VoiceEncryption = "auto" | "always" | "never";

export const CodecEncryptionMode = { perChannel: 0, off: 1, on: 2 } as const;

export function voiceEncrypted(setting: VoiceEncryption, server: SessionServer, channel: SessionChannel | undefined): boolean {
  if (setting !== "auto") return setting === "always";
  if (server.codecEncryptionMode === CodecEncryptionMode.on) return true;
  if (server.codecEncryptionMode === CodecEncryptionMode.off) return false;
  return channel !== undefined && !channel.codecUnencrypted;
}
