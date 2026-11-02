import { describe, expect, it } from "vitest";
import { useGateway } from "../../../../test/support/gateway.js";
import { ask, joinVoice, type VoiceSession } from "../../../../test/support/voice.js";

const gateways = useGateway();

const sharingMessages = (session: VoiceSession, after: number) =>
  session.socket.messages.slice(after).filter((message) => message.type === "sharingMembers");

async function share(session: VoiceSession, type: string, payload: Record<string, unknown> = {}) {
  const requestId = `q-${Math.random().toString(36).slice(2)}`;
  const after = session.socket.mark();
  session.socket.send({ type, requestId, ...payload } as never);
  return session.socket.waitForMessage((message) => message.requestId === requestId, { after });
}

describe("sharingMembers", () => {
  it("tells sessions in every channel who shares, and who stopped", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    const away = await joinVoice(gateway, { nickname: "away", channel: "Room B" });
    await ask(away, "sendTextMessage", { message: "" });
    const mark = away.socket.mark();

    const started = await share(owner, "screenShareStart");
    const stream = started.stream as { streamId: string; ownerClientId: number };
    const first = await away.socket.waitForMessage("sharingMembers", { after: mark });
    expect(first.clientIds).toEqual([stream.ownerClientId]);
    // Nobody else's list changes: the session in another channel got no stream to watch.
    expect(away.socket.messages.slice(mark).some((message) => message.type === "screenShareStarted")).toBe(false);

    const next = away.socket.mark();
    await share(owner, "screenShareStop", { streamId: stream.streamId });
    expect((await away.socket.waitForMessage("sharingMembers", { after: next })).clientIds).toEqual([]);
  });

  it("answers a list request with the current sharers", async () => {
    const gateway = await gateways.start();
    const owner = await joinVoice(gateway, { nickname: "owner" });
    const late = await joinVoice(gateway, { nickname: "late", channel: "Room B" });
    const stream = (await share(owner, "screenShareStart")).stream as { ownerClientId: number };
    await ask(late, "sendTextMessage", { message: "" });
    const mark = late.socket.mark();
    late.socket.send({ type: "screenShareList" } as never);
    await late.socket.waitForMessage("screenShareList", { after: mark });
    expect(sharingMessages(late, mark).at(-1)?.clientIds).toEqual([stream.ownerClientId]);
  });
});
