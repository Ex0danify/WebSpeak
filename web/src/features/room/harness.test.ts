import { afterEach, describe, expect, it } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "@/testSupport/harness";

let harness: VoiceHarness | null = null;

afterEach(() => {
  harness?.dispose();
  harness = null;
});

describe("fake gateway harness", () => {
  it("connects through a join ticket and receives `connected`", async () => {
    harness = await createVoiceHarness();
    const { voice, stubs } = harness;

    const socket = await harness.join();
    expect(stubs.fetchCalls.map((call) => call.url)).toEqual(["/api/join-ticket"]);
    expect(socket.url).toMatch(/^wss?:\/\/.+\/ws\/voice\?ticket=test-ticket$/);
    expect(voice.session.state.connecting).toBe(true);
    expect(voice.session.state.connected).toBe(false);

    socket.receive({ type: "connected", tsClientId: 7, members: [{ id: 7, nickname: "Tester" }] });
    expect(voice.session.state.connected).toBe(true);
    expect(voice.session.state.connecting).toBe(false);
    expect(voice.session.state.tsClientId).toBe(7);
    expect(voice.roster.members).toMatchObject([{ id: 7, nickname: "Tester", isSelf: true }]);
    expect(socket.sentOfType("setMicrophoneMuted")).toEqual([{ type: "setMicrophoneMuted", payload: { muted: false } }]);
    expect(socket.sentOfType("screenShareList")).toHaveLength(1);
  });
});
