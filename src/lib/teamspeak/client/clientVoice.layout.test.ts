import { describe, expect, it } from "vitest";
import { hasCaptures, loadCapture } from "../../../../test/support/tsCaptureFixtures.js";
import { startSession } from "../../../../test/support/tsSessionScript.js";
import { PacketFlag, PacketType } from "../transport/packetTypes.js";
import {
  buildVoiceBody,
  buildWhisperBody,
  MAX_WHISPER_TARGETS,
  parseServerVoice,
  voiceEncrypted,
  WhisperGroupTarget,
  WhisperGroupType,
} from "./clientVoice.js";

const OPUS = Buffer.from([0xf8, 0xff, 0xfe]);
const hex = (buffer: Buffer) => buffer.toString("hex");

describe("voice body", () => {
  it("is the codec, then the data", () => {
    expect(hex(buildVoiceBody(OPUS, 4))).toBe("04f8fffe");
    expect(hex(buildVoiceBody(Buffer.alloc(0), 5))).toBe("05");
  });

  it("refuses a codec that is no u8 and data over one datagram", () => {
    expect(() => buildVoiceBody(OPUS, 256)).toThrow(RangeError);
    expect(() => buildVoiceBody(OPUS, 1.5)).toThrow(RangeError);
    // 487 bytes of payload minus the voice id and the codec.
    expect(buildVoiceBody(Buffer.alloc(484), 4)).toHaveLength(485);
    expect(() => buildVoiceBody(Buffer.alloc(485), 4)).toThrow(/over 485/);
  });
});

describe("whisper body", () => {
  it("lists channels before clients, with the counts up front", () => {
    const { body, flags } = buildWhisperBody(OPUS, { channelIds: [0x0102030405060708n], clientIds: [7, 0xffff] }, 4);
    expect(flags).toBe(0);
    expect(hex(body)).toBe("04" + "01" + "02" + "0102030405060708" + "0007" + "ffff" + "f8fffe");
  });

  it("takes clients alone, the layout the old SDK sent", () => {
    expect(hex(buildWhisperBody(OPUS, { clientIds: [3] }, 5).body)).toBe("050001" + "0003" + "f8fffe");
  });

  it("uses the group layout with the NewProtocol flag", () => {
    const { body, flags } = buildWhisperBody(
      OPUS,
      { group: WhisperGroupType.channelGroup, target: WhisperGroupTarget.currentChannel, groupId: 8n },
      4,
    );
    expect(flags).toBe(PacketFlag.newProtocol);
    expect(hex(body)).toBe("04" + "01" + "01" + "0000000000000008" + "f8fffe");
    const all = buildWhisperBody(OPUS, { group: WhisperGroupType.allClients, target: WhisperGroupTarget.allChannels }, 4);
    expect(hex(all.body)).toBe("040300" + "0000000000000000" + "f8fffe");
  });

  it("refuses no targets, too many, and ids out of range", () => {
    const many = Array.from({ length: MAX_WHISPER_TARGETS }, (_, i) => i + 1);
    expect(() => buildWhisperBody(OPUS, {}, 4)).toThrow(/at least one/);
    expect(() => buildWhisperBody(OPUS, { clientIds: [], channelIds: [] }, 4)).toThrow(/at least one/);
    expect(buildWhisperBody(OPUS, { clientIds: many }, 4).body[2]).toBe(32);
    expect(() => buildWhisperBody(OPUS, { clientIds: many, channelIds: [1n] }, 4)).toThrow(/at most 32/);
    expect(() => buildWhisperBody(OPUS, { clientIds: [0x1_0000] }, 4)).toThrow(/client ids/);
    expect(() => buildWhisperBody(OPUS, { clientIds: [-1] }, 4)).toThrow(/client ids/);
    expect(() => buildWhisperBody(OPUS, { channelIds: [-1n] }, 4)).toThrow(/channel ids/);
    expect(() => buildWhisperBody(OPUS, { channelIds: [1n << 64n] }, 4)).toThrow(/channel ids/);
    expect(() => buildWhisperBody(OPUS, { clientIds: [1] }, -1)).toThrow(/codec/);
  });

  it("refuses unknown group modes and group ids out of range", () => {
    const group = { group: WhisperGroupType.serverGroup, target: WhisperGroupTarget.allChannels };
    expect(() => buildWhisperBody(OPUS, { ...group, group: 4 as WhisperGroupType }, 4)).toThrow(/group type/);
    expect(() => buildWhisperBody(OPUS, { ...group, target: 7 as WhisperGroupTarget }, 4)).toThrow(/group target/);
    expect(() => buildWhisperBody(OPUS, { ...group, groupId: -1n }, 4)).toThrow(/group id/);
  });

  it("refuses data that would not fit next to the targets", () => {
    // 485 bytes of body: codec, two counts and one client take 5.
    expect(buildWhisperBody(Buffer.alloc(480), { clientIds: [1] }, 4).body).toHaveLength(485);
    expect(() => buildWhisperBody(Buffer.alloc(481), { clientIds: [1] }, 4)).toThrow(RangeError);
  });
});

describe("voice from the server", () => {
  const packet = (type: 0 | 1, payload: string) => ({ type, flags: 0, index: 0, clientId: 0, payload: Buffer.from(payload, "hex") });

  it("reads voice id, speaker, codec and data", () => {
    expect(parseServerVoice(packet(PacketType.voice, "00110007" + "04" + "f8fffe"))).toEqual({
      type: "voice",
      clientId: 7,
      codec: 4,
      data: OPUS,
      whisper: false,
    });
    expect(parseServerVoice(packet(PacketType.voiceWhisper, "0011000705"))).toMatchObject({
      codec: 5,
      data: Buffer.alloc(0),
      whisper: true,
    });
  });

  it("drops packets too short for the header", () => {
    expect(parseServerVoice(packet(PacketType.voice, "00110007"))).toBeUndefined();
  });
});

describe("voice encryption", () => {
  const sessionWith = (mode: number, unencrypted: 0 | 1 | undefined) => {
    const { session, feed } = startSession(5, { virtualserver_codec_encryption_mode: String(mode) });
    const flag = unencrypted === undefined ? {} : { channel_codec_is_unencrypted: unencrypted };
    feed(
      `channellist cid=1 cpid=0 channel_name=Lobby${Object.entries(flag)
        .map(([key, value]) => ` ${key}=${value}`)
        .join("")}`,
    );
    return { server: session.server, channel: session.channel(1n) };
  };

  it("follows the channel in per-channel mode, unencrypted when the channel says nothing", () => {
    const encrypted = sessionWith(0, 0);
    expect(voiceEncrypted("auto", encrypted.server, encrypted.channel)).toBe(true);
    const plain = sessionWith(0, 1);
    expect(voiceEncrypted("auto", plain.server, plain.channel)).toBe(false);
    const unsaid = sessionWith(0, undefined);
    expect(voiceEncrypted("auto", unsaid.server, unsaid.channel)).toBe(false);
    expect(voiceEncrypted("auto", encrypted.server, undefined)).toBe(false);
  });

  it("follows the server when it turns encryption on or off for every channel", () => {
    const forced = sessionWith(2, 1);
    expect(voiceEncrypted("auto", forced.server, forced.channel)).toBe(true);
    const off = sessionWith(1, 0);
    expect(voiceEncrypted("auto", off.server, off.channel)).toBe(false);
  });

  it("lets the setting override the server", () => {
    const forced = sessionWith(2, 0);
    expect(voiceEncrypted("never", forced.server, forced.channel)).toBe(false);
    const off = sessionWith(1, 1);
    expect(voiceEncrypted("always", off.server, off.channel)).toBe(true);
  });
});

describe.skipIf(!hasCaptures)("voice against the TS3 capture", () => {
  it("builds the body of every voice packet the native client sent", () => {
    const voice = loadCapture("ts3LegacyPackets.json").packets.filter((packet) => packet.type === PacketType.voice);
    expect(voice.length).toBeGreaterThan(50);
    for (const packet of voice) {
      // Unencrypted, so the body after MAC and the 5-byte header is the payload.
      const payload = packet.raw.subarray(13);
      expect(hex(buildVoiceBody(payload.subarray(3), payload[2]))).toBe(hex(payload.subarray(2)));
    }
  });
});
