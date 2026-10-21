// A small QuickLZ 1.5 level 1 compressor for tests and the loopback server. The client never
// compresses, so this does not belong in the lib. It follows the hash rules of the decompressor:
// the table holds the last position of each 3-byte hash, positions inside a match are not hashed.

const HASH_SIZE = 4096;
const TAIL_BYTES = 11;
const ITEMS_PER_WORD = 31;

const hash3 = (data: Uint8Array, at: number) => {
  const value = data[at] | (data[at + 1] << 8) | (data[at + 2] << 16);
  return ((value >>> 12) ^ value) & 0xfff;
};

export function compressQuickLz(input: Uint8Array): Buffer {
  const out: number[] = [];
  const table = new Int32Array(HASH_SIZE).fill(-1);
  let controlAt = -1;
  let control = 0;
  let items = ITEMS_PER_WORD;
  const nextItem = (isReference: boolean) => {
    if (items === ITEMS_PER_WORD) {
      if (controlAt >= 0) writeControl();
      controlAt = out.length;
      out.push(0, 0, 0, 0);
      control = 0;
      items = 0;
    }
    if (isReference) control |= 1 << items;
    items++;
  };
  const writeControl = () => {
    const word = (control | 0x8000_0000) >>> 0;
    for (let i = 0; i < 4; i++) out[controlAt + i] = (word >>> (8 * i)) & 0xff;
  };

  const matchEnd = input.length - TAIL_BYTES;
  let at = 0;
  while (at < input.length) {
    if (at < matchEnd) {
      const hash = hash3(input, at);
      const from = table[hash];
      table[hash] = at;
      let length = 0;
      // The decompressor hashes the two bytes before a reference only after reading it, so such
      // near references would resolve differently there (QuickLZ's MINOFFSET).
      if (from >= 0 && at - from > 2)
        while (length < 255 && at + length < matchEnd && input[from + length] === input[at + length]) length++;
      if (length >= 3) {
        nextItem(true);
        if (length <= 17) out.push((hash << 4) | (length - 2), hash >> 4);
        else out.push((hash << 4) & 0xff, hash >> 4, length);
        at += length;
        continue;
      }
    }
    nextItem(false);
    out.push(input[at]);
    at++;
  }
  if (controlAt >= 0) writeControl();

  const long = out.length + 3 > 255 || input.length > 255;
  const header = long ? Buffer.alloc(9) : Buffer.alloc(3);
  header[0] = 0x45 | (long ? 2 : 0);
  if (long) {
    header.writeUInt32LE(out.length + 9, 1);
    header.writeUInt32LE(input.length, 5);
  } else {
    header[1] = out.length + 3;
    header[2] = input.length;
  }
  return Buffer.concat([header, Buffer.from(out)]);
}
