import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceConnection } from "./voiceTypes.js";
import { reportSelfActivity, syncTalkState } from "./selfActivity.js";

function connection(overrides: { canSpeak?: boolean; connected?: boolean; initialStateSent?: boolean } = {}) {
  const sendJson = vi.fn();
  const tsClient = { canSpeak: vi.fn(() => overrides.canSpeak ?? true), isConnected: vi.fn(() => overrides.connected ?? true) };
  const ctx = {
    entry: { selfActivityAt: 0, canSpeak: true },
    state: { selfId: 9, initialStateSent: overrides.initialStateSent ?? true },
    tsClient,
    sendJson,
  } as unknown as VoiceConnection;
  return { ctx, sendJson, tsClient };
}

describe("reportSelfActivity", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports the own client as speaking, at most every 100 ms", () => {
    const { ctx, sendJson } = connection();
    reportSelfActivity(ctx);
    reportSelfActivity(ctx);
    expect(sendJson).toHaveBeenCalledTimes(1);
    expect(sendJson).toHaveBeenCalledWith({ type: "voiceActivity", clientIds: [9] });
    vi.advanceTimersByTime(100);
    reportSelfActivity(ctx);
    expect(sendJson).toHaveBeenCalledTimes(2);
  });

  it("stays silent while the channel drops our voice", () => {
    const { ctx, sendJson } = connection({ canSpeak: false });
    reportSelfActivity(ctx);
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("stays silent while TeamSpeak is not connected", () => {
    const { ctx, sendJson } = connection({ connected: false });
    reportSelfActivity(ctx);
    expect(sendJson).not.toHaveBeenCalled();
  });
});

describe("syncTalkState", () => {
  it("tells the browser only when the talk right changes", () => {
    const { ctx, sendJson, tsClient } = connection();
    syncTalkState(ctx);
    expect(sendJson).not.toHaveBeenCalled();
    tsClient.canSpeak.mockReturnValue(false);
    syncTalkState(ctx);
    syncTalkState(ctx);
    expect(sendJson).toHaveBeenCalledTimes(1);
    expect(sendJson).toHaveBeenCalledWith({ type: "talkState", canSpeak: false });
    tsClient.canSpeak.mockReturnValue(true);
    syncTalkState(ctx);
    expect(sendJson).toHaveBeenLastCalledWith({ type: "talkState", canSpeak: true });
  });

  it("keeps the state for the connected message before the initial state went out", () => {
    const { ctx, sendJson, tsClient } = connection({ initialStateSent: false });
    tsClient.canSpeak.mockReturnValue(false);
    syncTalkState(ctx);
    expect(sendJson).not.toHaveBeenCalled();
    expect(ctx.entry.canSpeak).toBe(false);
  });
});
