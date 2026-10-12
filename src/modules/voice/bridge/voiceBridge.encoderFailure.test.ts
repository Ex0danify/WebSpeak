import { describe, expect, it, vi } from "vitest";
import { useGateway } from "../../../../test/support/gateway.js";

vi.mock("../audio/opusEncoder.js", () => ({
  createUplinkOpusEncoder: () => {
    throw new Error("no opus library");
  },
}));

const gateways = useGateway();

describe("a join whose Opus encoder cannot be created", () => {
  it("closes the socket and keeps no session behind", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    await socket.waitForClose();
    const admin = await gateway.adminLogin();
    await vi.waitFor(async () => expect((await (await admin.get("overview")).json()).sessions.active).toBe(0));
    expect(gateway.ts.created.every((client) => !client.isConnected())).toBe(true);
  });
});
