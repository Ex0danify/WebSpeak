import { describe, expect, it } from "vitest";
import { createTransportPair, datagramId, datagramType, TEST_FAKE_MAC, texts } from "../../../../test/support/tsTransportPair.js";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { DUMMY_PACKET_KEY, Ts3PacketKeys } from "../crypto/packetKeys.js";
import { encodePacket } from "./packetCodec.js";
import { PacketHandler, systemClock } from "./packetHandler.js";
import { PacketFlag, PacketType } from "./packetTypes.js";

describe("PacketHandler Init1", () => {
  it("resends Init1 until the server answers, the server role never resends", () => {
    let dropped = 0;
    const { clock, client, server, link } = createTransportPair({
      sessionKeys: false,
      impairment: { filter: (datagram, from) => from === "a" && dropped++ < 2 },
    });
    client.handler.sendInit1(Buffer.from([0, 1]));
    clock.runUntil(() => server.init1.length === 1);
    expect(clock.now()).toBe(1_000 + 2_000 + 20);
    server.handler.sendInit1(Buffer.from([1]));
    clock.runUntil(() => client.init1.length === 1);
    const sent = link.stats.sent;
    clock.advance(10_000);
    expect(link.stats.sent).toBe(sent);
    expect(client.init1[0]).toEqual(Buffer.from([1]));
  });

  it("closes when the server never answers, by idle timeout or by the Init1 give-up", () => {
    for (const [idleTimeoutMs, closedAt, message] of [
      [20_000, 20_000, "no packet from the peer in time"],
      [60_000, 30_000, "no answer to Init1"],
    ] as const) {
      const { clock, client } = createTransportPair({
        sessionKeys: false,
        impairment: { drop: 1 },
        options: { keepAlive: { idleTimeoutMs } },
      });
      client.handler.sendInit1(Buffer.from([0]));
      clock.runUntil(() => client.closed.length > 0);
      expect(client.closed[0]).toMatchObject({ code: "timeout", message });
      expect(clock.now()).toBe(closedAt);
    }
  });

  it("stops resending on request", () => {
    const { clock, client, link } = createTransportPair({ sessionKeys: false, impairment: { drop: 1 } });
    client.handler.sendInit1(Buffer.from([0]));
    client.handler.stopInit1Resend();
    clock.advance(5_000);
    expect(link.stats.sent).toBe(1);
  });
});

describe("PacketHandler keep-alive", () => {
  it("pings every second once started and answers pings with their id", () => {
    const pongs: number[] = [];
    const { clock, client, server } = createTransportPair({
      impairment: {
        filter: (datagram, from) => (
          datagramType(datagram, from) === PacketType.pong && pongs.push(datagram.readUInt16BE(from === "a" ? 13 : 11)),
          false
        ),
      },
    });
    client.handler.startKeepAlive();
    server.handler.startKeepAlive();
    clock.advance(3_500);
    expect(pongs.sort()).toEqual([0, 0, 1, 1, 2, 2]);
    clock.advance(60_000);
    expect([client.closed, server.closed]).toEqual([[], []]);
  });

  it("closes with a timeout when the peer goes silent", () => {
    const { clock, client, server } = createTransportPair();
    client.handler.startKeepAlive();
    server.handler.close();
    clock.runUntil(() => client.closed.length > 0);
    expect(client.closed[0]?.code).toBe("timeout");
    expect(clock.now()).toBe(20_000);
    expect(server.closed).toEqual([undefined]);
  });

  it("closes with an ack timeout when the peer is alive but never acks", () => {
    const { clock, client, server } = createTransportPair({
      impairment: { filter: (datagram, from) => from === "b" && datagramType(datagram, from) === PacketType.ack },
    });
    server.handler.startKeepAlive();
    client.handler.sendCommand(Buffer.from("clientupdate"));
    clock.runUntil(() => client.closed.length > 0);
    expect(client.closed[0]?.code).toBe("ackTimeout");
    expect(clock.now()).toBe(30_000);
  });

  it("ignores pings with a wrong fake MAC", () => {
    const { clock, client, link } = createTransportPair();
    const forged = encodePacket(
      "s2c",
      { type: PacketType.ping, flags: PacketFlag.unencrypted, id: 1, payload: Buffer.alloc(0) },
      undefined,
      Buffer.alloc(8),
    );
    link.b.send(forged);
    clock.advance(100);
    expect(link.stats.sent).toBe(1);
    expect(client.closed).toEqual([]);
  });
});

describe("PacketHandler keys", () => {
  it("accepts an ack sealed with the old key after the switch, like TS3's ack of clientek", () => {
    const { clock, client, server } = createTransportPair({ sessionKeys: false });
    const keys = new Ts3PacketKeys(Buffer.alloc(30, 3));
    client.handler.sendCommand(Buffer.from("clientek ek=x"));
    client.handler.switchKeys({ keys, fakeMac: TEST_FAKE_MAC });
    clock.runUntil(() => server.commands.length === 1);
    server.handler.switchKeys({ keys, fakeMac: TEST_FAKE_MAC });
    client.handler.sendCommand(Buffer.from("clientinit"));
    server.handler.sendCommand(Buffer.from("initserver aclid=2"));
    clock.runUntil(() => server.commands.length === 2 && client.commands.length === 1);
    clock.advance(10_000);
    expect(client.closed).toEqual([]);
    expect(texts(server.commands)).toEqual(["clientek ek=x", "clientinit"]);
  });

  it("drops commands sealed with a key it does not expect, and unencrypted ones", () => {
    const { clock, client, link } = createTransportPair();
    const payload = Buffer.from("notifytextmessage msg=forged");
    link.b.send(encodePacket("s2c", { type: PacketType.command, flags: 0, id: 0, payload }, DUMMY_PACKET_KEY, TEST_FAKE_MAC));
    link.b.send(encodePacket("s2c", { type: PacketType.command, flags: PacketFlag.unencrypted, id: 0, payload }, undefined, TEST_FAKE_MAC));
    link.b.send(Buffer.from("garbage"));
    clock.advance(100);
    expect(client.commands).toEqual([]);
    expect(link.stats.sent).toBe(3);
  });

  it("does not open packets beyond the receive window", () => {
    const { clock, client, server, link } = createTransportPair({ options: { receive: { windowSize: 2 } } });
    let first = true;
    link.b.send = ((send) => (datagram: Uint8Array) => {
      if (first) return void (first = false);
      send(datagram);
    })(link.b.send.bind(link.b));
    for (const text of ["a", "b", "c"]) server.handler.sendCommand(Buffer.from(text));
    clock.runUntil(() => client.commands.length === 3);
    expect(texts(client.commands)).toEqual(["a", "b", "c"]);
  });
});

describe("PacketHandler voice and ids", () => {
  it("puts the client id into the header and the packet id in front of the voice body", () => {
    const { clock, client, server } = createTransportPair();
    client.handler.clientId = 5;
    client.handler.sendVoice(PacketType.voiceWhisper, Buffer.from([4, 1, 2]));
    client.handler.sendVoice(PacketType.voice, Buffer.from([4]), PacketFlag.unencrypted);
    clock.advance(100);
    expect(server.voice.map(({ type, clientId, payload }) => [type, clientId, payload.toString("hex")])).toEqual([
      [PacketType.voiceWhisper, 5, "0000040102"],
      [PacketType.voice, 5, "000004"],
    ]);
  });

  it("measures the round trip from acks", () => {
    const { clock, client, server } = createTransportPair();
    client.handler.sendCommand(Buffer.from("version"), { low: true });
    clock.runUntil(() => server.commands.length === 1 && client.handler.smoothedRttMs !== undefined);
    expect(client.handler.smoothedRttMs).toBe(40);
    expect(server.commands[0].type).toBe(PacketType.commandLow);
  });

  it("starts commands at id 1 on both sides when Init1 carried command 0", () => {
    const ids: number[] = [];
    const { clock, client, server } = createTransportPair({
      impairment: {
        filter: (datagram, from) => (
          from === "a" && datagramType(datagram, from) === PacketType.command && ids.push(datagramId(datagram)),
          false
        ),
      },
    });
    client.handler.skipInitCommand();
    server.handler.skipInitCommand();
    client.handler.sendCommand(Buffer.from("clientek"));
    client.handler.sendCommand(Buffer.from("clientinit"), { low: true });
    expect(client.handler.pendingCommands).toBe(2);
    clock.advance(100);
    expect(ids).toEqual([1]);
    expect(texts(server.commands)).toEqual(["clientek", "clientinit"]);
    expect(client.handler.pendingCommands).toBe(0);
  });
});

describe("PacketHandler close", () => {
  it("closes once, stops sending and ignores what still arrives", () => {
    const { clock, client, server, link } = createTransportPair();
    server.handler.sendCommand(Buffer.from("a"));
    client.handler.close();
    client.handler.close();
    client.handler.sendCommand(Buffer.from("late"));
    client.handler.sendVoice(PacketType.voice, Buffer.from([4]));
    client.handler.sendInit1(Buffer.from([0]));
    clock.advance(1_000);
    expect(client.closed).toEqual([undefined]);
    expect(client.handler.closed).toBe(true);
    expect(client.commands).toEqual([]);
    expect(link.a.closed).toBe(true);
  });

  it("stops delivering when a command handler closes the connection", () => {
    const { clock, server, link } = createTransportPair({ sessionKeys: false });
    const seen: string[] = [];
    const client = new PacketHandler(
      link.a,
      {
        command: (message) => {
          seen.push(message.payload.toString());
          client.close();
        },
        closed: () => undefined,
      },
      { clock },
    );
    let held: Uint8Array | undefined;
    const send = link.b.send.bind(link.b);
    link.b.send = (datagram) => (held ? send(datagram) : void (held = datagram));
    server.handler.sendCommand(Buffer.from("first"));
    server.handler.sendCommand(Buffer.from("second"));
    send(held!);
    clock.advance(100);
    expect(seen).toEqual(["first"]);
  });

  it("closes with malformed data when a compressed command does not decompress", () => {
    const { clock, client, server } = createTransportPair();
    server.handler.sendCommand(Buffer.from([0x47, 1, 2, 3]), { compressed: true });
    clock.runUntil(() => client.closed.length > 0);
    expect(client.closed[0]?.code).toBe("malformedData");
  });

  it("closes with the socket error of its channel", () => {
    const { client, link } = createTransportPair();
    const error = new TeamSpeakTransportError("socketError", "gone");
    link.a.handlers!.error(error);
    expect(client.closed).toEqual([error]);
  });

  it("lets other errors of the command handler through", () => {
    const { clock, server, link } = createTransportPair({ sessionKeys: false });
    new PacketHandler(
      link.a,
      {
        command: () => {
          throw new Error("bug upstream");
        },
        closed: () => undefined,
      },
      { clock },
    );
    server.handler.sendCommand(Buffer.from("x"));
    expect(() => clock.advance(100)).toThrow("bug upstream");
  });

  it("runs on the system clock by default", () => {
    expect(systemClock.now()).toBeGreaterThan(0);
    const handle = systemClock.setTimer(() => undefined, 10_000);
    systemClock.clearTimer(handle);
  });
});
