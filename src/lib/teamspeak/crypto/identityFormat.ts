// The DER shape TeamSpeak uses for P-256 public keys (`omega`):
// SEQUENCE { BIT STRING (7 unused bits, 0x00), INTEGER 32, INTEGER x, INTEGER y }.
// Old clients sent SEQUENCE { INTEGER x, INTEGER y, … }, which we still read.

const COORDINATE_BYTES = 32;

export interface PublicPoint {
  x: Buffer;
  y: Buffer;
}

function tlv(tag: number, value: Uint8Array): Buffer {
  // Our values stay far below 128 bytes, so the short length form is enough.
  return Buffer.concat([Buffer.from([tag, value.length]), value]);
}

function derInteger(value: Uint8Array): Buffer {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  const trimmed = value.subarray(start);
  return tlv(0x02, trimmed[0] & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed);
}

export function encodeTsPublicKey(point: PublicPoint): Buffer {
  const body = Buffer.concat([
    tlv(0x03, Buffer.from([0x07, 0x00])),
    derInteger(Buffer.from([COORDINATE_BYTES])),
    derInteger(point.x),
    derInteger(point.y),
  ]);
  return tlv(0x30, body);
}

interface Element {
  tag: number;
  value: Buffer;
  end: number;
}

function readElement(data: Buffer, offset: number): Element | undefined {
  if (offset + 2 > data.length) return undefined;
  const tag = data[offset];
  let length = data[offset + 1];
  let start = offset + 2;
  if (length === 0x81 || length === 0x82) {
    const size = length - 0x80;
    if (start + size > data.length) return undefined;
    length = size === 1 ? data[start] : data.readUInt16BE(start);
    start += size;
  } else if (length > 0x7f) {
    return undefined;
  }
  const end = start + length;
  if (end > data.length) return undefined;
  return { tag, value: data.subarray(start, end), end };
}

/** A DER INTEGER as a 32-byte big-endian coordinate, or undefined when it does not fit. */
function coordinate(element: Element | undefined): Buffer | undefined {
  if (element?.tag !== 0x02 || element.value.length === 0 || element.value[0] & 0x80) return undefined;
  let start = 0;
  while (start < element.value.length - 1 && element.value[start] === 0) start++;
  const digits = element.value.subarray(start);
  if (digits.length > COORDINATE_BYTES) return undefined;
  const out = Buffer.alloc(COORDINATE_BYTES);
  digits.copy(out, COORDINATE_BYTES - digits.length);
  return out;
}

function sequenceElements(der: Uint8Array): Element[] | undefined {
  const data = Buffer.from(der.buffer, der.byteOffset, der.byteLength);
  const outer = readElement(data, 0);
  if (outer?.tag !== 0x30) return undefined;
  const elements: Element[] = [];
  for (let offset = 0; offset < outer.value.length && elements.length < 4;) {
    const element = readElement(outer.value, offset);
    if (!element) return undefined;
    elements.push(element);
    offset = element.end;
  }
  return elements;
}

/** x and y of a TeamSpeak public key in either shape, undefined for anything else. Not checked to be on the curve. */
export function decodeTsPublicKey(der: Uint8Array): PublicPoint | undefined {
  const elements = sequenceElements(der);
  if (!elements) return undefined;
  const [first, second, third, fourth] = elements;
  const pick = (x: Buffer | undefined, y: Buffer | undefined) => (x && y ? { x, y } : undefined);
  if (first?.tag === 0x03) return second?.tag === 0x02 ? pick(coordinate(third), coordinate(fourth)) : undefined;
  return pick(coordinate(first), coordinate(second));
}
