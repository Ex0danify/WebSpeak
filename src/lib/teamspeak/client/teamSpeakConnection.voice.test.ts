import { describe, expect, it } from "vitest";
import { createLink, ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { createLoopbackServer, type LoopbackServerOptions } from "../../../../test/support/tsLoopbackServer.js";
import { cmd } from "../../../../test/support/tsSessionScript.js";
import { generateIdentity } from "../crypto/identity.js";
import { PacketFlag, PacketType } from "../transport/packetTypes.js";
import { type VoiceEvent, WhisperGroupTarget, WhisperGroupType } from "./clientVoice.js";
import { TeamSpeakConnection, type TeamSpeakConnectionOptions } from "./teamSpeakConnection.js";

const identity = generateIdentity(0);
const OPUS = Buffer.from([0xf8, 0xff, 0xfe]);
const hex = (buffer: Buffer) => buffer.toString("hex");

async function run(clock: ManualClock, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 5) {
    clock.advance(5);
    await Promise.resolve();
  }
}

const welcome =
  (channelFields: Record<string, number> = {}) =>
  (clientId: number) => [
    cmd("channellist", { cid: 1, cpid: 0, channel_name: "Lobby", ...channelFields }),
    "channellistfinished",
    cmd("notifycliententerview", { cfid: 0, ctid: 1, reasonid: 2, clid: clientId, client_nickname: "Voice Tester" }),
  ];

async function connected(serverOptions: LoopbackServerOptions = {}, options: Partial<TeamSpeakConnectionOptions> = {}) {
  const clock = new ManualClock();
  const link = createLink(clock);
  const server = createLoopbackServer(link.b, { transport: { clock }, welcome: welcome(), ...serverOptions });
  const connection = new TeamSpeakConnection({
    address: { host: "127.0.0.1", port: 9987 },
    identity,
    nickname: "Voice Tester",
    transport: { clock },
    testSeams: { deriveServerKey: server.deriveServerKey },
    socketFactory: async () => link.a,
    ...options,
  });
  const connecting = connection.connect();
  await run(clock, 3_000);
  await connecting;
  const voice: VoiceEvent[] = [];
  connection.on("voice", (event) => voice.push({ ...event, data: Buffer.from(event.data) }));
  return { clock, server, connection, voice };
}

describe("sending voice", () => {
  it("sends channel voice unencrypted on a channel that is", async () => {
    const { clock, server, connection } = await connected();
    connection.sendVoice(OPUS);
    connection.sendVoice(OPUS, 5);
    await run(clock, 50);
    expect(server.voice.map((packet) => [packet.type, packet.flags, packet.clientId, hex(packet.payload)])).toEqual([
      [PacketType.voice, PacketFlag.unencrypted, 3, "0000" + "04f8fffe"],
      [PacketType.voice, PacketFlag.unencrypted, 3, "0001" + "05f8fffe"],
    ]);
  });

  it("encrypts when the channel asks for it", async () => {
    const { clock, server, connection } = await connected({ welcome: welcome({ channel_codec_is_unencrypted: 0 }) });
    connection.sendVoice(OPUS);
    await run(clock, 50);
    expect(server.voice).toMatchObject([{ type: PacketType.voice, flags: 0 }]);
    expect(hex(server.voice[0].payload)).toBe("0000" + "04f8fffe");
  });

  it("encrypts when the server forces it, unless told never to", async () => {
    const forced = { initServerFields: { virtualserver_codec_encryption_mode: 2 } };
    const auto = await connected(forced);
    auto.connection.sendVoice(OPUS);
    await run(auto.clock, 50);
    expect(auto.server.voice[0].flags).toBe(0);
    const never = await connected(forced, { voiceEncryption: "never" });
    never.connection.sendVoice(OPUS);
    await run(never.clock, 50);
    expect(never.server.voice[0].flags).toBe(PacketFlag.unencrypted);
  });

  it("sends list and group whispers with their own counter", async () => {
    const { clock, server, connection } = await connected({}, { voiceEncryption: "always" });
    connection.sendVoice(OPUS);
    connection.sendWhisper(OPUS, { clientIds: [7], channelIds: [2n] });
    connection.sendWhisper(OPUS, { group: WhisperGroupType.serverGroup, target: WhisperGroupTarget.allChannels, groupId: 8n }, 5);
    await run(clock, 50);
    expect(server.voice.map((packet) => [packet.type, packet.flags, hex(packet.payload)])).toEqual([
      [PacketType.voice, 0, "0000" + "04f8fffe"],
      [PacketType.voiceWhisper, 0, "0000" + "040101" + "0000000000000002" + "0007" + "f8fffe"],
      [PacketType.voiceWhisper, PacketFlag.newProtocol, "0001" + "050000" + "0000000000000008" + "f8fffe"],
    ]);
  });

  it("drops voice while not connected, but still refuses bad whisper targets", async () => {
    const clock = new ManualClock();
    const link = createLink(clock);
    const idle = new TeamSpeakConnection({
      address: { host: "127.0.0.1", port: 9987 },
      identity,
      nickname: "x",
      socketFactory: async () => link.a,
    });
    expect(() => idle.sendVoice(OPUS)).not.toThrow();
    expect(() => idle.sendWhisper(OPUS, { clientIds: [] })).toThrow(RangeError);

    const { clock: connectedClock, server, connection } = await connected();
    const leaving = connection.disconnect();
    await run(connectedClock, 3_000);
    await leaving;
    connection.sendVoice(OPUS);
    connection.sendWhisper(OPUS, { clientIds: [7] });
    expect(server.voice).toEqual([]);
  });
});

describe("receiving voice", () => {
  const fromServer = (type: 0 | 1, clientId: number, codec: number, data: Buffer) => {
    const body = Buffer.alloc(3 + data.length);
    body.writeUInt16BE(clientId, 0);
    body[2] = codec;
    data.copy(body, 3);
    return { type, body };
  };

  it("emits voice and whisper from others, plain or encrypted, and the end of a transmission", async () => {
    const { clock, server, voice } = await connected();
    const send = (packet: ReturnType<typeof fromServer>, flags: number) => server.handler.sendVoice(packet.type, packet.body, flags);
    send(fromServer(PacketType.voice, 9, 4, OPUS), PacketFlag.unencrypted);
    send(fromServer(PacketType.voice, 9, 4, OPUS), 0);
    send(fromServer(PacketType.voiceWhisper, 10, 5, OPUS), 0);
    send(fromServer(PacketType.voice, 9, 4, Buffer.alloc(0)), PacketFlag.unencrypted);
    await run(clock, 50);
    expect(voice).toEqual([
      { type: "voice", clientId: 9, codec: 4, data: OPUS, whisper: false },
      { type: "voice", clientId: 9, codec: 4, data: OPUS, whisper: false },
      { type: "voice", clientId: 10, codec: 5, data: OPUS, whisper: true },
      { type: "voice", clientId: 9, codec: 4, data: Buffer.alloc(0), whisper: false },
    ]);
  });

  it("drops our own voice and packets too short for the header", async () => {
    const { clock, server, voice } = await connected();
    const own = fromServer(PacketType.voice, 3, 4, OPUS);
    server.handler.sendVoice(own.type, own.body, PacketFlag.unencrypted);
    server.handler.sendVoice(PacketType.voice, Buffer.from([0, 9]), PacketFlag.unencrypted);
    await run(clock, 50);
    expect(voice).toEqual([]);
  });

  it("does not parse voice nobody listens to", async () => {
    const { clock, server, connection, voice } = await connected();
    connection.removeAllListeners("voice");
    const packet = fromServer(PacketType.voice, 9, 4, OPUS);
    server.handler.sendVoice(packet.type, packet.body, PacketFlag.unencrypted);
    await run(clock, 50);
    expect(voice).toEqual([]);
  });
});
