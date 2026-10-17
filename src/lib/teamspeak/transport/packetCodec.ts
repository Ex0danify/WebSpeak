import { timingSafeEqual } from "node:crypto";
import { eaxDecrypt, eaxEncrypt } from "../crypto/eax.js";
import type { PacketDirection, PacketKey } from "../crypto/packetKeys.js";
import { headerBytes, INIT1_MAC, MAC_BYTES, MAX_DATAGRAM_BYTES, PACKET_TYPE_COUNT, PacketFlag, PacketType } from "./packetTypes.js";

export interface PacketFields {
  type: PacketType;
  /** High nibble only, see PacketFlag. */
  flags: number;
  id: number;
  /** Client to server only. */
  clientId?: number;
  payload: Uint8Array;
}

/** A datagram split into its parts. Every Buffer is a view into the datagram. */
export interface ParsedPacket {
  direction: PacketDirection;
  type: PacketType;
  flags: number;
  id: number;
  clientId: number;
  mac: Buffer;
  header: Buffer;
  body: Buffer;
}

const isU16 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffff;

/**
 * Init1 carries the fixed `TS3INIT1` MAC, unencrypted packets the fake MAC, everything else is EAX
 * sealed with the header as associated data.
 */
export function encodePacket(direction: PacketDirection, fields: PacketFields, key: PacketKey | undefined, fakeMac: Uint8Array): Buffer {
  const { type, flags, id, clientId = 0, payload } = fields;
  if (!isU16(id) || !isU16(clientId)) throw new RangeError("packet id and client id must be u16");
  if ((flags & 0x0f) !== 0) throw new RangeError(`packet flags must leave the type nibble free, got ${flags}`);
  const headerLength = headerBytes(direction);
  const size = MAC_BYTES + headerLength + payload.length;
  if (size > MAX_DATAGRAM_BYTES) throw new RangeError(`packet of ${size} bytes is over ${MAX_DATAGRAM_BYTES}`);

  const datagram = Buffer.allocUnsafe(size);
  datagram.writeUInt16BE(id, MAC_BYTES);
  if (direction === "c2s") datagram.writeUInt16BE(clientId, MAC_BYTES + 2);
  datagram[MAC_BYTES + headerLength - 1] = type | flags;
  const header = datagram.subarray(MAC_BYTES, MAC_BYTES + headerLength);

  if (type === PacketType.init1 || flags & PacketFlag.unencrypted) {
    datagram.set(type === PacketType.init1 ? INIT1_MAC : fakeMac.subarray(0, MAC_BYTES), 0);
    datagram.set(payload, MAC_BYTES + headerLength);
    return datagram;
  }
  if (!key) throw new RangeError("an encrypted packet needs a key");
  const sealed = eaxEncrypt(key.key, key.nonce, header, payload);
  sealed.tag.copy(datagram, 0);
  sealed.ciphertext.copy(datagram, MAC_BYTES + headerLength);
  return datagram;
}

/** Undefined for datagrams too short for a header or with an unknown packet type. */
export function parsePacket(direction: PacketDirection, datagram: Buffer): ParsedPacket | undefined {
  const headerLength = headerBytes(direction);
  if (datagram.length < MAC_BYTES + headerLength) return undefined;
  const typeAndFlags = datagram[MAC_BYTES + headerLength - 1];
  const type = typeAndFlags & 0x0f;
  if (type >= PACKET_TYPE_COUNT) return undefined;
  return {
    direction,
    type: type as PacketType,
    flags: typeAndFlags & 0xf0,
    id: datagram.readUInt16BE(MAC_BYTES),
    clientId: direction === "c2s" ? datagram.readUInt16BE(MAC_BYTES + 2) : 0,
    mac: datagram.subarray(0, MAC_BYTES),
    header: datagram.subarray(MAC_BYTES, MAC_BYTES + headerLength),
    body: datagram.subarray(MAC_BYTES + headerLength),
  };
}

/**
 * The payload, or undefined when the MAC does not match. `fakeMac` undefined accepts any MAC on an
 * unencrypted packet, which is all a client can do before the handshake gave it the fake MAC.
 */
export function openPacket(packet: ParsedPacket, key: PacketKey | undefined, fakeMac: Uint8Array | undefined): Buffer | undefined {
  if (packet.type === PacketType.init1) return packet.mac.equals(INIT1_MAC) ? packet.body : undefined;
  if (packet.flags & PacketFlag.unencrypted) {
    if (fakeMac && !timingSafeEqual(packet.mac, fakeMac.subarray(0, MAC_BYTES))) return undefined;
    return packet.body;
  }
  if (!key) return undefined;
  return eaxDecrypt(key.key, key.nonce, packet.header, packet.body, packet.mac);
}
