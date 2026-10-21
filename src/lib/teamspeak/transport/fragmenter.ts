import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { PacketFlag } from "./packetTypes.js";

export interface PacketPart {
  flags: number;
  payload: Buffer;
}

/**
 * Splits a command into packets of at most `maxBytes`. The first and the last packet of a split
 * command carry the Fragmented flag, those in between do not, and only the first keeps Compressed.
 */
export function splitPayload(payload: Buffer, maxBytes: number, flags: number): PacketPart[] {
  if (payload.length <= maxBytes) return [{ flags, payload }];
  const parts: PacketPart[] = [];
  for (let offset = 0; offset < payload.length; offset += maxBytes) {
    const first = offset === 0;
    const last = offset + maxBytes >= payload.length;
    let partFlags = first ? flags : flags & ~PacketFlag.compressed;
    partFlags = first || last ? partFlags | PacketFlag.fragmented : partFlags & ~PacketFlag.fragmented;
    parts.push({ flags: partFlags, payload: payload.subarray(offset, offset + maxBytes) });
  }
  return parts;
}

export interface AssembledMessage {
  /** Flags of the first packet without Fragmented. */
  flags: number;
  payload: Buffer;
  /** Packets the message took. */
  count: number;
}

/**
 * Takes the message that starts at `next` out of an in-order buffer, or returns undefined while a
 * part is missing. Throws when a split command grows over `maxBytes`.
 */
export function takeMessage(buffer: Map<number, PacketPart>, next: number, maxBytes: number): AssembledMessage | undefined {
  const head = buffer.get(next);
  if (!head) return undefined;
  if (!(head.flags & PacketFlag.fragmented)) {
    buffer.delete(next);
    return { flags: head.flags, payload: head.payload, count: 1 };
  }
  const parts = [head.payload];
  let size = head.payload.length;
  for (let index = next + 1; ; index++) {
    const part = buffer.get(index);
    if (!part) return undefined;
    parts.push(part.payload);
    size += part.payload.length;
    if (size > maxBytes) throw new TeamSpeakTransportError("malformedData", `split command is over ${maxBytes} bytes`);
    if (part.flags & PacketFlag.fragmented) break;
  }
  for (let i = 0; i < parts.length; i++) buffer.delete(next + i);
  return { flags: head.flags & ~PacketFlag.fragmented, payload: Buffer.concat(parts, size), count: parts.length };
}
