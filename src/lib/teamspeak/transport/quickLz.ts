import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";

// QuickLZ 1.5 decompression, level 1 only: both TS3 3.13 and TS6 beta13 send level 1, and the
// client never compresses.
//
// Header: flags byte (bit 0 compressed, bit 1 long header, bits 2-3 level), then compressed and
// decompressed size as u8 (short) or u32le (long). The body is a sequence of 32-bit little-endian
// control words, each followed by up to 31 items: bit 0 set is a back reference, clear a literal.
// Bit 31 is a sentinel, a control word is used up when only it remains.

const HASH_SIZE = 4096;
// The last bytes of every stream are literals, the compressor never matches into them.
const TAIL_BYTES = 10;
const SENTINEL = 0x8000_0000;

export const DEFAULT_MAX_DECOMPRESSED_BYTES = 1024 * 1024;

function fail(reason: string): never {
  throw new TeamSpeakTransportError("malformedData", `QuickLZ: ${reason}`);
}

function readHeader(data: Uint8Array) {
  if (data.length < 3) fail("data is shorter than the header");
  const flags = data[0];
  if (((flags >> 2) & 3) !== 1) fail(`level ${(flags >> 2) & 3} is not supported`);
  const long = (flags & 2) !== 0;
  const headerLength = long ? 9 : 3;
  if (data.length < headerLength) fail("data is shorter than the header");
  const view = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const compressedSize = long ? view.readUInt32LE(1) : data[1];
  const size = long ? view.readUInt32LE(5) : data[2];
  if (compressedSize !== data.length) fail(`header says ${compressedSize} bytes, got ${data.length}`);
  return { compressed: (flags & 1) !== 0, headerLength, size };
}

export function decompressQuickLz(data: Uint8Array, maxBytes = DEFAULT_MAX_DECOMPRESSED_BYTES): Buffer {
  const { compressed, headerLength, size } = readHeader(data);
  if (size > maxBytes) fail(`${size} bytes is over the limit of ${maxBytes}`);
  if (!compressed) {
    if (data.length - headerLength !== size) fail("stored data does not match its size");
    return Buffer.from(data.subarray(headerLength));
  }

  const out = Buffer.alloc(size);
  // Positions of earlier 3-byte sequences by hash, -1 for none yet.
  const table = new Int32Array(HASH_SIZE).fill(-1);
  const hashAt = (at: number) => {
    const value = out[at] | (out[at + 1] << 8) | (out[at + 2] << 16);
    return ((value >>> 12) ^ value) & 0xfff;
  };
  let hashed = -1;
  const hashUpTo = (end: number) => {
    while (hashed < end) {
      hashed++;
      table[hashAt(hashed)] = hashed;
    }
  };

  let src = headerLength;
  let dst = 0;
  let control = 1;
  const literalEnd = Math.max(size - TAIL_BYTES - 1, 0);
  for (;;) {
    if (control === 1) {
      if (src + 4 > data.length) fail("control word is cut off");
      control = (data[src] | (data[src + 1] << 8) | (data[src + 2] << 16) | (data[src + 3] << 24)) >>> 0;
      src += 4;
    }
    if (control & 1) {
      control >>>= 1;
      if (src + 2 > data.length) fail("reference is cut off");
      const low = data[src];
      const hash = (low >> 4) | (data[src + 1] << 4);
      let length = low & 0x0f;
      if (length !== 0) {
        length += 2;
        src += 2;
      } else {
        if (src + 3 > data.length) fail("reference is cut off");
        length = data[src + 2];
        src += 3;
      }
      const from = table[hash];
      if (from < 0 || from >= dst) fail("reference to data that does not exist yet");
      if (length < 3 || dst + length > size) fail("reference runs past the output");
      // Byte by byte on purpose: source and target may overlap.
      for (let i = 0; i < length; i++) out[dst + i] = out[from + i];
      dst += length;
      hashUpTo(dst - length);
      hashed = dst - 1;
    } else if (dst < literalEnd) {
      if (src >= data.length) fail("literal is cut off");
      out[dst++] = data[src++];
      control >>>= 1;
      hashUpTo(dst - 3);
    } else {
      // The tail is all literals; its control words carry no information and are skipped.
      while (dst < size) {
        if (control === 1) {
          src += 4;
          control = SENTINEL;
        }
        if (src >= data.length) fail("literal is cut off");
        out[dst++] = data[src++];
        control >>>= 1;
      }
      if (src !== data.length) fail("data continues after the output is complete");
      return out;
    }
  }
}
