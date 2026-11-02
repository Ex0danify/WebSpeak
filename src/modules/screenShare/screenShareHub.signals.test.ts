import { describe, expect, it } from "vitest";
import { ScreenShareHub, type ScreenStreamRecord } from "./screenShareHub.js";
import type { ScreenShareHost } from "./screenShareTypes.js";

const host = { getParticipant: () => undefined, participants: () => [], getIceServers: () => [] } as unknown as ScreenShareHost;

function stream(streamId: string): ScreenStreamRecord {
  return { streamId, targetKey: "ts:9987", viewerEntryIds: new Set(), nativeViewerClids: new Set() } as unknown as ScreenStreamRecord;
}

describe("queued screen share signals", () => {
  it("sends bulk and reuses one signal per stream, sender and peer", () => {
    const hub = new ScreenShareHub(host);
    const s = stream("a");
    const first = hub.signalSendOptions(s, "viewer", 7);
    expect(first.priority).toBe("bulk");
    expect(hub.signalSendOptions(s, "viewer", 7).signal).toBe(first.signal);
    expect(hub.signalSendOptions(s, "viewer", 8).signal).not.toBe(first.signal);
  });

  it("aborts only what matches, and starts a fresh signal afterwards", () => {
    const hub = new ScreenShareHub(host);
    const s = stream("a");
    const mine = hub.signalSendOptions(s, "viewer", 7).signal!;
    const otherSender = hub.signalSendOptions(s, "owner", 7).signal!;
    const otherStream = hub.signalSendOptions(stream("b"), "viewer", 7).signal!;
    hub.dropQueuedSignals(s, "viewer");
    expect([mine.aborted, otherSender.aborted, otherStream.aborted]).toEqual([true, false, false]);
    expect(hub.signalSendOptions(s, "viewer", 7).signal!.aborted).toBe(false);
    hub.dropQueuedSignals(s);
    expect(otherSender.aborted).toBe(true);
    expect(otherStream.aborted).toBe(false);
  });
});
