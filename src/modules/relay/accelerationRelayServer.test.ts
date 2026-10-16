import { createSocket, type Socket } from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import { decodeFrame, encodeFrame, FrameType, jsonPayload, parseJson } from "./accelerationRelayFrames.js";
import { createAccelerationRelayServer } from "./accelerationRelayServer.js";

const TOKEN = "relay-test-token-0123456789";
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function startRelay(options: Partial<Parameters<typeof createAccelerationRelayServer>[0]> = {}) {
  const relay = await createAccelerationRelayServer({ host: "127.0.0.1", port: 0, token: TOKEN, ...options });
  cleanups.push(() => relay.close());
  return relay;
}

/** Sends an OPEN for the target and resolves with the first reply frame the relay answers with. */
async function open(relayPort: number, targetHost: string, targetPort = 9987) {
  const client: Socket = createSocket("udp4");
  cleanups.push(() => client.close());
  const reply = new Promise<{ type: FrameType; detail: Record<string, unknown> | null }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no reply from relay")), 2_000);
    client.once("message", (packet) => {
      clearTimeout(timer);
      const frame = decodeFrame(packet);
      if (!frame) return reject(new Error("undecodable reply"));
      resolve({ type: frame.type, detail: parseJson(frame.payload) });
    });
  });
  client.send(encodeFrame(FrameType.OPEN, 7, 0, jsonPayload({ targetHost, targetPort }), TOKEN), relayPort, "127.0.0.1");
  return reply;
}

describe("acceleration relay target policy", () => {
  it("blocks a hostname that resolves to a loopback address", async () => {
    const relay = await startRelay({ lookupAddresses: async () => [{ address: "127.0.0.1", family: 4 }] });
    const result = await open(relay.port, "innocent.example");
    expect(result.type).toBe(FrameType.OPEN_ERR);
    expect(result.detail?.code).toBe("PRIVATE_TARGET_BLOCKED");
  });

  it("blocks a mixed answer when any record is restricted", async () => {
    const relay = await startRelay({
      lookupAddresses: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    });
    const result = await open(relay.port, "mixed.example");
    expect(result.detail?.code).toBe("PRIVATE_TARGET_BLOCKED");
  });

  it.each(["::ffff:127.0.0.1", "::ffff:10.1.2.3", "224.0.0.1", "198.18.0.1", "192.0.2.1", "ff02::1", "fec0::1"])(
    "blocks the literal %s",
    async (literal) => {
      const relay = await startRelay();
      const result = await open(relay.port, literal);
      expect(result.detail?.code).toBe("PRIVATE_TARGET_BLOCKED");
    },
  );

  it("lets a public target through to the dial step", async () => {
    const relay = await startRelay({ lookupAddresses: async () => [{ address: "93.184.216.34", family: 4 }] });
    const result = await open(relay.port, "public.example");
    expect(result.detail?.code).not.toBe("PRIVATE_TARGET_BLOCKED");
  });

  it("allows private targets when the operator opted in", async () => {
    const relay = await startRelay({ allowPrivate: true, lookupAddresses: async () => [{ address: "127.0.0.1", family: 4 }] });
    const result = await open(relay.port, "internal.example");
    expect(result.detail?.code).not.toBe("PRIVATE_TARGET_BLOCKED");
  });

  it("reports a failed DNS lookup as an open error", async () => {
    const relay = await startRelay({
      lookupAddresses: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    const result = await open(relay.port, "nowhere.example");
    expect(result.type).toBe(FrameType.OPEN_ERR);
    expect(result.detail?.code).toBe("TARGET_OPEN_FAILED");
  });
});

describe("acceleration relay lifecycle", () => {
  it("rejects startup instead of crashing the process when the port is taken", async () => {
    const first = await startRelay();
    await expect(createAccelerationRelayServer({ host: "127.0.0.1", port: first.port, token: TOKEN })).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
    // The first relay is unaffected by its failed sibling.
    const result = await open(first.port, "::ffff:127.0.0.1");
    expect(result.detail?.code).toBe("PRIVATE_TARGET_BLOCKED");
  });

  it("closes idempotently", async () => {
    const relay = await startRelay();
    relay.close();
    expect(() => relay.close()).not.toThrow();
  });
});
