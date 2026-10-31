// What the router does with a gateway error: one that answers a request lands in the state, one that does not goes to the room.
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "@/testSupport/harness";
import type { FakeWebSocket } from "@/testSupport/fakeWebsocket";

let harness: VoiceHarness;

async function connected(): Promise<FakeWebSocket> {
  harness = await createVoiceHarness();
  return harness.joinAndConnect();
}

async function push(socket: FakeWebSocket, message: Record<string, unknown>): Promise<void> {
  socket.receive(message);
  await flushPromises();
}

afterEach(() => harness?.dispose());

describe("error", () => {
  it("maps the protocol error code and message of a request into state", async () => {
    const socket = await connected();
    await push(socket, { type: "error", requestId: "r1", error: { code: "CHANNEL_FULL", message: "full" } });
    expect(harness.voice.session.state.errorCode).toBe("CHANNEL_FULL");
    expect(harness.voice.session.state.error).not.toBe("");
    expect(harness.voice.session.state.unattributedError).toBeNull();
  });

  it("falls back to OPERATION_FAILED and a generic message", async () => {
    const socket = await connected();
    await push(socket, { type: "error", requestId: "r1" });
    expect(harness.voice.session.state.errorCode).toBe("OPERATION_FAILED");
    expect(harness.voice.session.state.error).not.toBe("");
  });

  it("keeps an error without a request id out of the state once joined and hands it to the room", async () => {
    const socket = await connected();
    await push(socket, { type: "error", error: { code: "FLOOD_PROTECTION", message: "slow down" } });
    expect(harness.voice.session.state.errorCode).toBe("");
    expect(harness.voice.session.state.error).toBe("");
    expect(harness.voice.session.state.unattributedError).toMatchObject({ code: "FLOOD_PROTECTION" });
  });

  it("replaces the unattributed error on a repeat of the same code", async () => {
    const socket = await connected();
    await push(socket, { type: "error", error: { code: "INVALID_AUDIO_FRAME" } });
    const first = harness.voice.session.state.unattributedError;
    await push(socket, { type: "error", error: { code: "INVALID_AUDIO_FRAME" } });
    expect(harness.voice.session.state.unattributedError).not.toBe(first);
  });

  it("still fills the state before the room is joined, the join screen reads it there", async () => {
    harness = await createVoiceHarness();
    const socket = await harness.join();
    await push(socket, { type: "error", error: { code: "SESSION_NOT_READY" } });
    expect(harness.voice.session.state.errorCode).toBe("SESSION_NOT_READY");
  });
});
