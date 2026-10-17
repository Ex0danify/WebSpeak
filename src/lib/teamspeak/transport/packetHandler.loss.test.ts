import { describe, expect, it } from "vitest";
import { compressQuickLz } from "../../../../test/support/quickLzCompressor.js";
import { createTransportPair, datagramId, datagramType, texts } from "../../../../test/support/tsTransportPair.js";
import { generationOf } from "./generationWindow.js";
import { PacketFlag, PacketType } from "./packetTypes.js";

const numbered = (count: number, prefix: string) => Array.from({ length: count }, (_, i) => `${prefix} n=${i}`);
const channelList = (rows: number) =>
  Array.from({ length: rows }, (_, i) => `cid=${i} cpid=${i >> 3} channel_name=Room\\s${i} channel_order=${i - 1}`).join("|");

describe("PacketHandler over a lossy link", () => {
  it("delivers 10 000 server commands in order at 10 % loss, and client commands alongside", () => {
    const { clock, client, server, link } = createTransportPair({ impairment: { drop: 0.1 }, seed: 11 });
    const up = numbered(1_000, "clientupdate");
    const down = numbered(10_000, "notifyclientupdated");
    for (const text of up) client.handler.sendCommand(Buffer.from(text));
    for (const text of down) server.handler.sendCommand(Buffer.from(text));
    clock.runUntil(() => server.commands.length === up.length && client.commands.length === down.length);
    expect(texts(server.commands)).toEqual(up);
    expect(texts(client.commands)).toEqual(down);
    expect(link.stats.dropped).toBeGreaterThan(2_000);
    expect([client.closed, server.closed]).toEqual([[], []]);
  }, 20_000);

  it("delivers in order through duplicates and reordering", () => {
    const { clock, client, server, link } = createTransportPair({
      impairment: { drop: 0.05, duplicate: 0.1, reorder: 0.3, reorderMs: 200 },
      seed: 5,
    });
    const down = numbered(2_000, "notifytextmessage");
    for (const text of down) server.handler.sendCommand(Buffer.from(text), { low: down.indexOf(text) % 2 === 0 });
    clock.runUntil(() => client.commands.length === down.length);
    const byType = (type: number) => texts(client.commands.filter((message) => message.type === type));
    expect(byType(PacketType.commandLow)).toEqual(down.filter((_, i) => i % 2 === 0));
    expect(byType(PacketType.command)).toEqual(down.filter((_, i) => i % 2 === 1));
    expect(link.stats.duplicated).toBeGreaterThan(100);
  });

  it("resends a command whose ack was lost, and delivers it once", () => {
    let acks = 0;
    let copies = 0;
    const { clock, client, server } = createTransportPair({
      impairment: {
        filter: (datagram, from) => {
          if (from === "a" && datagramType(datagram, from) === PacketType.command) copies++;
          return from === "b" && datagramType(datagram, from) === PacketType.ack && acks++ < 3;
        },
      },
    });
    client.handler.sendCommand(Buffer.from("clientpoke clid=2 msg=hi"));
    clock.runUntil(() => acks > 3);
    clock.advance(10_000);
    expect(copies).toBe(4);
    expect(texts(server.commands)).toEqual(["clientpoke clid=2 msg=hi"]);
    expect(client.closed).toEqual([]);
  });

  it("recovers a lost middle fragment of a compressed 20 kB command", () => {
    const text = channelList(250);
    const compressed = compressQuickLz(Buffer.from(text));
    expect(compressed.length).toBeGreaterThan(3 * 489);
    let dropped = false;
    const { clock, client, server } = createTransportPair({
      impairment: {
        filter: (datagram, from) => {
          if (dropped || from !== "b" || datagramType(datagram, from) !== PacketType.command || datagramId(datagram) !== 2) return false;
          return (dropped = true);
        },
      },
    });
    server.handler.sendCommand(Buffer.from("initivexpand2 l=AQ"));
    server.handler.sendCommand(compressed, { compressed: true });
    server.handler.sendCommand(Buffer.from("channellistfinished"));
    clock.runUntil(() => client.commands.length === 3);
    expect(dropped).toBe(true);
    expect(texts(client.commands)).toEqual(["initivexpand2 l=AQ", text, "channellistfinished"]);
    expect(client.commands[1].flags & PacketFlag.compressed).toBe(0);
  });

  it("splits a 20 kB uncompressed client command and the server reassembles it", () => {
    const { clock, client, server } = createTransportPair({ impairment: { drop: 0.2 }, seed: 3 });
    const text = `channeledit ${"channel_description=x".repeat(1000)}`;
    client.handler.sendCommand(Buffer.from(text));
    clock.runUntil(() => server.commands.length === 1);
    expect(texts(server.commands)).toEqual([text]);
    expect(server.commands[0].flags).toBe(PacketFlag.newProtocol);
  });

  // The command side of the wrap is covered by the sender, receiver and counter tests; through the
  // handler 65 536 commands cost about 9 s of EAX, until the voice hot path work makes it cheaper.
  it("tracks the voice generation across the wrap and decrypts with its keys", () => {
    const { clock, client, server } = createTransportPair();
    const bulk = 0x10000 - 10;
    for (let i = 0; i < bulk; i++) server.handler.sendVoice(PacketType.voice, Buffer.from([0, 7, 4]), PacketFlag.unencrypted);
    clock.runUntil(() => client.voice.length === bulk);
    for (let i = 0; i < 20; i++) server.handler.sendVoice(PacketType.voice, Buffer.from([0, 7, 4, i]));
    clock.runUntil(() => client.voice.length === bulk + 20);
    const encrypted = client.voice.slice(bulk);
    expect(encrypted.map((packet) => packet.payload[5])).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(generationOf(encrypted.at(-1)!.index)).toBe(1);
    expect(encrypted.at(-1)!.payload.readUInt16BE(0)).toBe(9);
    expect(client.voice.every((packet, i) => packet.index === i)).toBe(true);
  });
});
