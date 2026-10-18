/**
 * Voice packet benchmark of the own TeamSpeak client against the old SDK: sealing and opening one
 * packet, and the receive path from datagram to parsed voice, plain and encrypted.
 *
 *   npx tsx scripts/bench-ts-lib-voice.ts [--packets 50000] [--bytes 120]
 *
 * Not run by `npm test`, not part of CI. Parity with the pinned SDK, removed together with the SDK.
 */
import { EventEmitter } from "node:events";
import { Crypt, generateIdentity as sdkIdentity } from "@echosixhiya/teamspeak-client/crypto";
import { PacketHandler as SdkPacketHandler } from "@echosixhiya/teamspeak-client/transport";
import { parseServerVoice } from "../src/lib/teamspeak/client/clientVoice.js";
import { deriveIvStruct, LegacyPacketKeys, legacyFakeMac } from "../src/lib/teamspeak/crypto/packetKeys.js";
import { encodePacket, openPacket, parsePacket } from "../src/lib/teamspeak/transport/packetCodec.js";
import { PacketHandler } from "../src/lib/teamspeak/transport/packetHandler.js";
import { PacketFlag, PacketType } from "../src/lib/teamspeak/transport/packetTypes.js";

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} needs a positive integer`);
  return value;
}

const packets = arg("packets", 50_000);
const frameBytes = arg("bytes", 120);
const alpha = Buffer.alloc(10, 0xa1);
const beta = Buffer.alloc(54, 0xbe);
const shared = Buffer.alloc(64, 0x5c);
const ivStruct = deriveIvStruct(alpha, beta, shared);
const fakeMac = legacyFakeMac(ivStruct);
const keys = new LegacyPacketKeys(ivStruct);
const frame = Buffer.alloc(frameBytes, 0x42);

function bench(name: string, run: (i: number) => void): void {
  for (let i = 0; i < 2_000; i++) run(i);
  const started = performance.now();
  for (let i = 0; i < packets; i++) run(i);
  console.log(`${name.padEnd(44)} ${(((performance.now() - started) * 1000) / packets).toFixed(2)} µs/packet`);
}

// S2C voice from client 9, ids in order so neither side drops them as old.
function serverVoice(encrypted: boolean): Buffer[] {
  return Array.from({ length: packets + 2_000 }, (_, id) => {
    const payload = Buffer.alloc(5 + frame.length);
    payload.writeUInt16BE(id & 0xffff, 0);
    payload.writeUInt16BE(9, 2);
    payload[4] = 4;
    frame.copy(payload, 5);
    const flags = encrypted ? 0 : PacketFlag.unencrypted;
    const key = encrypted ? keys.keyFor("s2c", PacketType.voice, 0, id & 0xffff) : undefined;
    return encodePacket("s2c", { type: PacketType.voice, flags, id: id & 0xffff, payload }, key, fakeMac);
  });
}

console.log(`${packets} packets of ${frameBytes} bytes of Opus`);

const crypt = new Crypt(sdkIdentity(0));
crypt.setSharedSecret(alpha, beta, shared);
const header = Buffer.from([0, 0, 0, 3, 0]);
// Crypt opens with the server's keys, so the packet to open is one from the server.
const fromServer = encodePacket("s2c", { type: PacketType.voice, flags: 0, id: 7, payload: frame }, keys.keyFor("s2c", 0, 0, 7), fakeMac);
const s2cHeader = fromServer.subarray(8, 11);
bench("SDK seal (Crypt.encrypt)", (i) => crypt.encrypt(0, i & 0xffff, 0, header, frame, false, false));
bench("SDK open (Crypt.decrypt)", () =>
  crypt.decrypt(0, 7, 0, s2cHeader, fromServer.subarray(11), fromServer.subarray(0, 8), false, false),
);

const c2sKey = (i: number) => keys.keyFor("c2s", PacketType.voice, 0, i & 0xffff);
bench("lib seal (keyFor + encodePacket)", (i) =>
  encodePacket("c2s", { type: PacketType.voice, flags: 0, id: i & 0xffff, clientId: 3, payload: frame }, c2sKey(i), fakeMac),
);
const datagram = encodePacket("c2s", { type: PacketType.voice, flags: 0, id: 7, clientId: 3, payload: frame }, c2sKey(7), fakeMac);
bench("lib open (parsePacket + keyFor + openPacket)", () => openPacket(parsePacket("c2s", datagram)!, c2sKey(7), undefined));

for (const encrypted of [false, true]) {
  const label = encrypted ? "encrypted" : "plain";
  const datagrams = serverVoice(encrypted);

  const sdkSocket = Object.assign(new EventEmitter(), { send: () => undefined, close: () => undefined });
  const sdk = new SdkPacketHandler(crypt);
  let sdkVoice = 0;
  sdk.onPacket = () => sdkVoice++;
  sdk.start(sdkSocket as never);
  bench(`SDK receive, ${label} (handler, no setImmediate)`, (i) => sdkSocket.emit("message", datagrams[i]));
  sdk.close();

  let deliver: (datagram: Buffer) => void = () => undefined;
  let libVoice = 0;
  const handler = new PacketHandler(
    { attach: (handlers) => (deliver = handlers.message), send: () => undefined, close: () => undefined },
    { command: () => undefined, voice: (packet) => parseServerVoice(packet) && libVoice++, closed: () => undefined },
  );
  handler.switchKeys({ keys, fakeMac });
  bench(`lib receive, ${label} (handler + parse)`, (i) => deliver(datagrams[i]));
  handler.close();
  if (sdkVoice !== libVoice) throw new Error(`SDK delivered ${sdkVoice} packets, the lib ${libVoice}`);
}
