// The screen-share stats module (Step V5.1, split out of useScreenSharePeers): the pure record readers and the
// one-second poll. Peers are created through the module's own entry points, on stub peers whose
// stats a test controls (test-support/screen-share-peers.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserStubs } from "./test-support/browser-stubs";
import { displayStream, installPeerEnvironment, makeStream, queueStats, setupPeers, type Stat } from "./test-support/screen-share-peers";
import {
  screenShareStatsNumber, screenShareStatsRecord, screenShareStatsString, screenShareVideoStatsKind,
} from "./useScreenShareStats";

let stubs: BrowserStubs;

/** A viewer peer, as `screenShareJoined` makes one for a TeamSpeak stream (no offer is sent). */
async function addViewer(context: ReturnType<typeof setupPeers>, records: Stat[], peerId = "p1"): Promise<void> {
  queueStats(records);
  await context.module.startScreenShareViewer(makeStream({ streamId: `v-${peerId}`, source: "teamspeak", ownerPeerId: peerId }));
}

/** An owner peer for a native viewer of the own share. */
async function addOwner(context: ReturnType<typeof setupPeers>, records: Stat[], peerId = "p1"): Promise<void> {
  queueStats(records);
  context.store.screenShareStreams.push(makeStream({ streamId: "mine", ownerPeerId: "me" }));
  context.store.screenShareActiveStreamId = "mine";
  await context.module.startNativeScreenShareViewer("mine", peerId);
}

beforeEach(() => {
  stubs = installPeerEnvironment();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(50_000));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stubs.restore();
});

describe("stats readers", () => {
  it("screenShareStatsRecord accepts objects only", () => {
    expect(screenShareStatsRecord({ a: 1 })).toEqual({ a: 1 });
    expect(screenShareStatsRecord(null)).toEqual({});
    expect(screenShareStatsRecord("x")).toEqual({});
    expect(screenShareStatsRecord(undefined)).toEqual({});
  });

  it("screenShareStatsNumber keeps finite numbers only", () => {
    expect(screenShareStatsNumber({ a: 3 }, "a")).toBe(3);
    expect(screenShareStatsNumber({ a: 0 }, "a")).toBe(0);
    expect(screenShareStatsNumber({ a: Number.NaN }, "a")).toBeNull();
    expect(screenShareStatsNumber({ a: Infinity }, "a")).toBeNull();
    expect(screenShareStatsNumber({ a: "3" }, "a")).toBeNull();
    expect(screenShareStatsNumber(undefined, "a")).toBeNull();
  });

  it("screenShareStatsString keeps non-empty strings only", () => {
    expect(screenShareStatsString({ a: "x" }, "a")).toBe("x");
    expect(screenShareStatsString({ a: "" }, "a")).toBeNull();
    expect(screenShareStatsString({ a: 1 }, "a")).toBeNull();
    expect(screenShareStatsString(undefined, "a")).toBeNull();
  });

  it("screenShareVideoStatsKind prefers kind, then mediaType, then empty", () => {
    expect(screenShareVideoStatsKind({ kind: "video", mediaType: "audio" })).toBe("video");
    expect(screenShareVideoStatsKind({ mediaType: "video" })).toBe("video");
    expect(screenShareVideoStatsKind({})).toBe("");
  });
});

describe("polling", () => {
  it("does nothing without peers, but still arms the timer", async () => {
    const { module, stats } = setupPeers();
    module.startScreenShareStatsPolling();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(stats.updatedAt).toBeNull();
    module.stopScreenShareStatsPolling();
  });

  it("samples at once, then every second, and a second start keeps the same timer", async () => {
    const context = setupPeers();
    await addViewer(context, []);
    const [peer] = context.peers;
    const getStats = vi.spyOn(peer, "getStats");
    context.module.startScreenShareStatsPolling();
    context.module.startScreenShareStatsPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(context.stats.updatedAt).toBe(50_000);
    expect(getStats).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getStats).toHaveBeenCalledTimes(1);
    context.module.stopScreenShareStatsPolling();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getStats).toHaveBeenCalledTimes(1);
  });

  it("skips a tick while the previous sample is still in flight", async () => {
    const context = setupPeers();
    await addViewer(context, []);
    const [peer] = context.peers;
    let release: () => void = () => {};
    const getStats = vi.spyOn(peer, "getStats").mockImplementation(() => new Promise((resolve) => { release = () => resolve({ forEach: () => {} } as never); }));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(getStats).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getStats).toHaveBeenCalledTimes(2);
    context.module.stopScreenShareStatsPolling();
  });

  it("stop clears the published stats and the previous samples", async () => {
    const context = setupPeers();
    await addViewer(context, [{ id: "a", type: "inbound-rtp", kind: "video", bytesReceived: 1_000, framesDecoded: 10 }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.stats.peers).toHaveLength(1);
    context.module.stopScreenShareStatsPolling();
    expect(context.stats).toMatchObject({ updatedAt: null, capture: null, peers: [] });
  });

  it("publishes the capture settings of the local video track", async () => {
    const context = setupPeers();
    await context.capture(displayStream({ width: 1920, height: 1080, frameRate: 30 }).stream);
    await addViewer(context, []);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.stats.capture).toEqual({ width: 1920, height: 1080, frameRate: 30 });
    context.module.stopScreenShareStatsPolling();
  });

  it("capture is null without a local stream, and fields are null when settings are not numbers", async () => {
    const first = setupPeers();
    await addViewer(first, []);
    await vi.advanceTimersByTimeAsync(0);
    expect(first.stats.capture).toBeNull();
    first.module.closeAllScreenSharePeers();
    const second = setupPeers();
    await second.capture(displayStream({ width: "1920" }).stream);
    await addViewer(second, []);
    await vi.advanceTimersByTimeAsync(0);
    expect(second.stats.capture).toEqual({ width: null, height: null, frameRate: null });
    second.module.closeAllScreenSharePeers();
  });

  it("drops a peer whose getStats rejects and keeps the others", async () => {
    const context = setupPeers();
    await addViewer(context, [], "bad");
    await addViewer(context, [], "ok");
    vi.spyOn(context.peers[0], "getStats").mockRejectedValue(new Error("closed"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(context.stats.peers.map((peer) => peer.peerId)).toEqual(["ok"]);
    context.module.closeAllScreenSharePeers();
  });
});

describe("peer sample", () => {
  const owner: Stat[] = [
    { id: "out", type: "outbound-rtp", kind: "video", codecId: "codec", bytesSent: 10_000, framesEncoded: 100, packetsSent: 90, frameWidth: 1280, frameHeight: 720, qualityLimitationReason: "cpu", framesDropped: 2 },
    { id: "codec", type: "codec", mimeType: "video/VP9" },
    { id: "remote", type: "remote-inbound-rtp", kind: "video", packetsLost: 10, roundTripTime: 0.05, jitter: 0.002 },
    { id: "pair", type: "candidate-pair", nominated: true, localCandidateId: "local", availableOutgoingBitrate: 2_000_000, currentRoundTripTime: 0.9 },
    { id: "local", type: "local-candidate", candidateType: "srflx" },
  ];

  it("reads an owner's outbound sample, remote-inbound loss and the selected pair", async () => {
    const context = setupPeers();
    await addOwner(context, owner);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.stats.peers[0]).toEqual({
      peerId: "p1", role: "owner", direction: "outbound", connectionState: "connected", iceConnectionState: "connected",
      codec: "video/VP9", candidateType: "srflx", width: 1280, height: 720, frameRate: null, bitrateKbps: null,
      packetsLost: 10, packetsTotal: 100, lossPercent: 10, framesDropped: 2, jitterMs: 2, roundTripTimeMs: 50,
      availableOutgoingBitrateKbps: 2_000, qualityLimitationReason: "cpu",
    });
    context.module.closeAllScreenSharePeers();
  });

  it("reads a viewer's inbound sample and ignores outbound records", async () => {
    const context = setupPeers();
    await addViewer(context, [
      ...owner,
      { id: "in", type: "inbound-rtp", kind: "video", framesDecoded: 5, bytesReceived: 500, packetsReceived: 45, packetsLost: 5, jitter: 0.01 },
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.stats.peers[0]).toMatchObject({ role: "viewer", direction: "inbound", packetsLost: 5, packetsTotal: 50, lossPercent: 10, jitterMs: 10, width: null });
    context.module.closeAllScreenSharePeers();
  });

  it("derives frame rate and bitrate from two samples at least 250 ms apart, and prefers direct values", async () => {
    const record = { id: "out", type: "outbound-rtp", kind: "video", framesEncoded: 100, bytesSent: 10_000 } as Stat;
    const context = setupPeers();
    let clock = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    await addOwner(context, [record]);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.stats.peers[0]).toMatchObject({ frameRate: null, bitrateKbps: null });
    clock = 1_100;
    record.framesEncoded = 103; record.bytesSent = 10_100;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(context.stats.peers[0]).toMatchObject({ frameRate: null, bitrateKbps: null });
    clock = 2_000;
    record.framesEncoded = 130; record.bytesSent = 20_000;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(context.stats.peers[0].frameRate).toBeCloseTo((27 * 1_000) / 900);
    expect(context.stats.peers[0].bitrateKbps).toBeCloseTo((9_900 * 8) / 900);
    Object.assign(record, { framesPerSecond: 24, bitrate: 3_000_000 });
    clock = 3_000;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(context.stats.peers[0]).toMatchObject({ frameRate: 24, bitrateKbps: 3_000 });
    context.module.closeAllScreenSharePeers();
  });

  it("closing a peer forgets its previous sample, so a new peer with the same id restarts the derived rates", async () => {
    const record = { id: "out", type: "outbound-rtp", kind: "video", framesEncoded: 100, bytesSent: 10_000 } as Stat;
    const context = setupPeers();
    let clock = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    await addOwner(context, [record], "p1");
    await addOwner(context, [{ ...record }], "p2");
    await vi.advanceTimersByTimeAsync(1_000);
    context.module.closeScreenSharePeer("p1");
    clock = 2_000;
    context.peers[1].records[0].framesEncoded = 130;
    await addOwner(context, [{ ...record, framesEncoded: 130 }], "p1");
    await vi.advanceTimersByTimeAsync(1_000);
    const byId = new Map(context.stats.peers.map((peer) => [peer.peerId, peer]));
    expect(byId.get("p1")?.frameRate).toBeNull();
    expect(byId.get("p2")?.frameRate).toBeCloseTo(30);
    context.module.closeAllScreenSharePeers();
  });
});
