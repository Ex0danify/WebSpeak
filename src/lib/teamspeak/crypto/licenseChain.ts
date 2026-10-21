import { createHash } from "node:crypto";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import { clampScalar, decodePoint, encodeFlipped, multiplyUnreduced, scalarFromBytes } from "./edwards.js";

// The `l` parameter of initivexpand2 and initivxalpha: version byte 1, then license blocks. Each block
// turns the key of its parent into the key of the next one, starting from TeamSpeak's root key. The
// last key is the server's Ed25519 key.

const ROOT_KEY = Buffer.from("cd0de2aed46345509a7e3cfd8f68b3dc7555b29dccec73cd18750f993812408a", "hex");
const VERSION = 1;
const HEADER_BYTES = 42;
const MAX_BLOCKS = 16;
// Block times count from 2013-01-01, not from 1970.
const EPOCH_OFFSET_SECONDS = 0x50e22700;

export const LicenseBlockType = { intermediate: 0, server: 2, ts5Server: 8, ephemeral: 32 } as const;

export interface LicenseBlock {
  type: number;
  /** Ed25519 point of the block, 32 bytes. */
  key: Buffer;
  notValidBefore: Date;
  notValidAfter: Date;
  serverType?: number;
  issuer?: string;
  properties?: Buffer[];
  /** First 32 bytes of SHA-512 over the block without its key kind byte, the block's scalar. */
  hash: Buffer;
}

const fail = (reason: string, cause?: unknown) => new HandshakeError("license", reason, cause === undefined ? undefined : { cause });

/** The issuer text and the byte length it takes including its terminating zero. */
function readIssuer(data: Buffer, start: number): { issuer: string; bytes: number } {
  const end = data.indexOf(0, start);
  if (end < 0) throw fail("issuer is not terminated");
  return { issuer: data.toString("utf8", start, end), bytes: end - start + 1 };
}

/** Length of the type specific part after the 42-byte header, plus what it holds. */
function readPayload(type: number, data: Buffer): { length: number; fields: Partial<LicenseBlock> } {
  switch (type) {
    case LicenseBlockType.intermediate: {
      const { issuer, bytes } = readIssuer(data, HEADER_BYTES + 4);
      return { length: 4 + bytes, fields: { issuer } };
    }
    case LicenseBlockType.server: {
      const { issuer, bytes } = readIssuer(data, HEADER_BYTES + 5);
      return { length: 5 + bytes, fields: { serverType: data[HEADER_BYTES], issuer } };
    }
    case LicenseBlockType.ts5Server: {
      if (data.length < HEADER_BYTES + 2) throw fail("block is truncated");
      const count = data[HEADER_BYTES + 1];
      const properties: Buffer[] = [];
      let position = HEADER_BYTES + 2;
      for (let i = 0; i < count; i++) {
        if (position >= data.length) throw fail("property is truncated");
        const length = data[position++];
        if (position + length > data.length) throw fail("property is truncated");
        properties.push(Buffer.from(data.subarray(position, position + length)));
        position += length;
      }
      return { length: position - HEADER_BYTES, fields: { serverType: data[HEADER_BYTES], properties } };
    }
    case LicenseBlockType.ephemeral:
      return { length: 0, fields: {} };
    default:
      throw fail(`unknown block type ${type}`);
  }
}

function readBlock(data: Buffer): { block: LicenseBlock; length: number } {
  if (data.length < HEADER_BYTES) throw fail("block is truncated");
  if (data[0] !== 0) throw fail(`unknown key kind ${data[0]}`);
  const type = data[33];
  const notValidBefore = new Date((data.readUInt32BE(34) + EPOCH_OFFSET_SECONDS) * 1000);
  const notValidAfter = new Date((data.readUInt32BE(38) + EPOCH_OFFSET_SECONDS) * 1000);
  if (notValidAfter < notValidBefore) throw fail("block ends before it starts");
  const payload = readPayload(type, data);
  const length = HEADER_BYTES + payload.length;
  const hash = createHash("sha512").update(data.subarray(1, length)).digest().subarray(0, 32);
  const key = Buffer.from(data.subarray(1, 33));
  return { block: { type, key, notValidBefore, notValidAfter, ...payload.fields, hash }, length };
}

export function parseLicenseChain(license: Uint8Array): LicenseBlock[] {
  const data = Buffer.from(license.buffer, license.byteOffset, license.byteLength);
  if (data.length < 1 || data[0] !== VERSION) throw fail(`unsupported license version ${data[0]}`);
  const blocks: LicenseBlock[] = [];
  for (let offset = 1; offset < data.length;) {
    if (blocks.length === MAX_BLOCKS) throw fail(`more than ${MAX_BLOCKS} blocks`);
    const { block, length } = readBlock(data.subarray(offset));
    blocks.push(block);
    offset += length;
  }
  if (blocks.length === 0) throw fail("no blocks");
  return blocks;
}

/** Each step: `flip((-blockKey) · clamp(hash) + (-parentKey))`. */
export function deriveLicenseKey(blocks: readonly LicenseBlock[]): Buffer {
  let parent: Buffer = ROOT_KEY;
  for (const block of blocks) {
    try {
      const own = multiplyUnreduced(decodePoint(block.key).negate(), scalarFromBytes(clampScalar(block.hash)));
      parent = encodeFlipped(own.add(decodePoint(parent).negate()));
    } catch (error) {
      throw fail("block key is not a point", error);
    }
  }
  return parent;
}
