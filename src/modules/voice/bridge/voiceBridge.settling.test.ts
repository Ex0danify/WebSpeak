import { describe, expect, it, vi } from "vitest";
import { FakeTeamSpeakServer, type FakeTSClient } from "../../../../test/support/fakeTsClient.js";
import { useGateway } from "../../../../test/support/gateway.js";
import { joinVoice } from "../../../../test/support/voice.js";

const gateways = useGateway();

/** The fake client that finished connect() while the server withholds the directory snapshot, so the session sits in `syncing`. */
async function settlingClient(gateway: Awaited<ReturnType<typeof gateways.start>>): Promise<FakeTSClient> {
  return vi.waitFor(
    () => {
      const created = gateway.ts.created[0];
      if (!created?.isConnected()) throw new Error("the fake client is not connected yet");
      return created;
    },
    { timeout: 10_000 },
  );
}

const sessionCount = async (gateway: Awaited<ReturnType<typeof gateways.start>>) => {
  const admin = await gateway.adminLogin();
  return ((await (await admin.get("sessions")).json()) as { sessions: unknown[] }).sessions.length;
};

describe("a TeamSpeak drop while the session is still settling", () => {
  it("before the first directory snapshot ends the join with a failure instead of leaving the browser waiting", async () => {
    const gateway = await gateways.start({ ts: new FakeTeamSpeakServer({ withholdSnapshot: true }) });
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    const client = await settlingClient(gateway);

    client.receiveDrop(new Error("connection reset"));

    const failure = await socket.waitForMessage("connectionFailed");
    expect(failure.code).toEqual(expect.any(String));
    expect((await socket.waitForClose()).code).toBe(4003);
    expect(socket.messagesOfType("connectionFailed")).toHaveLength(1);
    expect(socket.messagesOfType("connected")).toEqual([]);
    await vi.waitFor(async () => expect(await sessionCount(gateway)).toBe(0), { timeout: 10_000 });
  });

  it("a kick in the same window is reported as the reason and is final", async () => {
    const gateway = await gateways.start({ ts: new FakeTeamSpeakServer({ withholdSnapshot: true }) });
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    const client = await settlingClient(gateway);

    gateway.ts.kick(client, "spam", true);

    const failure = await socket.waitForMessage("connectionFailed");
    expect(failure.code).toEqual(expect.any(String));
    await socket.waitForClose();
    // The drop that follows a kick must not report a second failure.
    expect(socket.messagesOfType("connectionFailed")).toHaveLength(1);
    await vi.waitFor(async () => expect(await sessionCount(gateway)).toBe(0), { timeout: 10_000 });
  });

  it("during a reconnect handshake goes back to reconnecting and tries again", async () => {
    const gateway = await gateways.start();
    const { socket, client } = await joinVoice(gateway, { nickname: "alice" });

    // The reconnect handshake connects but its snapshot never arrives, so the session settles in `syncing`.
    gateway.ts.withholdSnapshot = true;
    const afterFirstDrop = socket.mark();
    gateway.ts.drop(client);
    await socket.waitForMessage("reconnecting", { after: afterFirstDrop });
    await vi.waitFor(() => expect(client.isConnected()).toBe(true), { timeout: 5_000 });

    const afterSecondDrop = socket.mark();
    gateway.ts.withholdSnapshot = false;
    gateway.ts.drop(client);

    await socket.waitForMessage("reconnecting", { after: afterSecondDrop, timeoutMs: 5_000 });
    await socket.waitForMessage("reconnected", { after: afterSecondDrop, timeoutMs: 10_000 });
    expect(socket.messagesOfType("connectionFailed")).toEqual([]);
  }, 30_000);
});
