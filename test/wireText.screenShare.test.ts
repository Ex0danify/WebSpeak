// Step I0.6: the wire text the gateway sends today, pinned row by row (screen share errors). Step I2 changes the
// `message` column on purpose (D-I1, D-I2) and adds optional fields; these files prove that nothing else
// moved. Expected text is written with escapes so the files stay free of CJK characters (G-GW-LIT).
import { describe, expect, it, vi } from "vitest";
import { handleRawScreenNotification, handleScreenShareMessage, ScreenShareHub, screenStreamKey, type ScreenShareClientMessage, type ScreenShareHost, type ScreenShareParticipant } from "../src/modules/screenShare/index.js";
import { teamSpeakTargetKey } from "../src/shared/teamSpeakTarget.js";

describe("screen share errors (screenSharePublish, screenShareNative)", () => {
  const target = { host: "ts.example", port: 9987 };

  function participant(id: string, overrides: Partial<{ clientId: number; sendProtocolCommand: (command: string) => Promise<void> }> = {}) {
    const frames: Record<string, unknown>[] = [];
    const entry: ScreenShareParticipant = {
      id,
      nickname: id,
      screenPeerId: `peer-${id}`,
      target,
      tsClient: {
        getClientId: () => overrides.clientId ?? 1,
        getChannelId: () => 1n,
        isConnected: () => true,
        sendProtocolCommand: overrides.sendProtocolCommand ?? (async () => undefined),
      },
      ws: { readyState: 1, send: (data: string) => frames.push(JSON.parse(data)) },
      members: new Map(),
    };
    return { entry, frames };
  }

  function world(...overrides: Parameters<typeof participant>[1][]) {
    const people = ["owner", "viewer", "other"].map((id, index) => participant(id, { clientId: index + 1, ...overrides[index] }));
    const byId = new Map(people.map((person) => [person.entry.id, person.entry]));
    const host: ScreenShareHost = {
      getParticipant: (id) => byId.get(id),
      participants: () => byId.values(),
      getIceServers: () => [],
      logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
    };
    const hub = new ScreenShareHub(host);
    const [owner, viewer, other] = people;
    const reply = (who: typeof owner, message: ScreenShareClientMessage) => {
      const sent: Record<string, unknown>[] = [];
      handleScreenShareMessage(hub, who.entry, message, (frame) => sent.push(frame));
      return sent;
    };
    return { hub, owner, viewer, other, reply };
  }

  const code = (c: string, message: string, extra: Record<string, unknown> = {}) => ({ type: "screenShareError", ...extra, code: c, message });

  function startedShare() {
    const w = world();
    const started = w.reply(w.owner, { type: "screenShareStart", requestId: "s" });
    const streamId = (started[0].stream as { streamId: string }).streamId;
    return { ...w, streamId };
  }

  it("SCREEN_SHARE_ALREADY_ACTIVE: a second share by the same session", () => {
    const w = startedShare();
    expect(w.reply(w.owner, { type: "screenShareStart", requestId: "again" })).toEqual([code("SCREEN_SHARE_ALREADY_ACTIVE", "You are already sharing your screen", { requestId: "again" })]);
  });

  it("SCREEN_SHARE_NOT_FOUND: a stream that does not exist, with and without a request id", () => {
    const w = world();
    expect(w.reply(w.viewer, { type: "screenShareJoin", requestId: "j", streamId: "nope" })).toEqual([code("SCREEN_SHARE_NOT_FOUND", "The screen share has ended or does not exist", { requestId: "j" })]);
    expect(w.reply(w.viewer, { type: "screenShareSignal", streamId: "nope", targetPeerId: "p", signal: { kind: "close" } })).toEqual([code("SCREEN_SHARE_NOT_FOUND", "The screen share has ended or does not exist")]);
  });

  it("SCREEN_SHARE_TARGET_MISMATCH: the stream's channel is not the session's channel", () => {
    const w = startedShare();
    w.hub.screenStreams.get(screenStreamKey(teamSpeakTargetKey(target), w.streamId))!.channelId = 2n;
    expect(w.reply(w.viewer, { type: "screenShareJoin", requestId: "j", streamId: w.streamId })).toEqual([code("SCREEN_SHARE_TARGET_MISMATCH", "The screen share does not belong to the current server or channel", { requestId: "j" })]);
  });

  it("SCREEN_SHARE_NOT_OWNER and SCREEN_SHARE_OWNER_CANNOT_JOIN", () => {
    const w = startedShare();
    expect(w.reply(w.viewer, { type: "screenShareStop", requestId: "x", streamId: w.streamId })).toEqual([code("SCREEN_SHARE_NOT_OWNER", "Only the sharer can end the share", { requestId: "x" })]);
    expect(w.reply(w.owner, { type: "screenShareJoin", requestId: "j", streamId: w.streamId })).toEqual([code("SCREEN_SHARE_OWNER_CANNOT_JOIN", "The sharer cannot join their own share as a viewer", { requestId: "j" })]);
  });

  it("browser share signalling: SCREEN_SHARE_SIGNAL_FORBIDDEN and SCREEN_SHARE_PEER_NOT_FOUND", () => {
    const w = startedShare();
    const signal = { kind: "answer", sdp: "v=0" } as const;
    // A session that has not joined may not signal.
    expect(w.reply(w.other, { type: "screenShareSignal", streamId: w.streamId, targetPeerId: "peer-owner", signal })).toEqual([code("SCREEN_SHARE_SIGNAL_FORBIDDEN", "Not allowed to send signals for this screen share")]);
    w.reply(w.viewer, { type: "screenShareJoin", requestId: "j", streamId: w.streamId });
    // A viewer may only signal the owner.
    expect(w.reply(w.viewer, { type: "screenShareSignal", streamId: w.streamId, targetPeerId: "peer-other", signal })).toEqual([code("SCREEN_SHARE_PEER_NOT_FOUND", "The viewer has left")]);
  });

  describe("a stream that TeamSpeak announced", () => {
    function nativeShare(...overrides: Parameters<typeof participant>[1][]) {
      const w = world(...overrides);
      handleRawScreenNotification(w.hub, w.viewer.entry, { name: "notifystreamstarted", params: { id: "ts-1", clid: "50" } } as never);
      const stream = [...w.hub.screenStreams.values()][0];
      return { ...w, stream };
    }

    it("is named by the defaults when TeamSpeak sends no name", () => {
      const { stream } = nativeShare();
      expect({ name: stream.name, ownerNickname: stream.ownerNickname }).toEqual({ name: "TeamSpeak screen share", ownerNickname: "TeamSpeak user 50" });
    });

    it("SCREEN_SHARE_SOURCE_UNAVAILABLE: a join whose source client is gone, with the request id", () => {
      const w = nativeShare();
      w.stream.sourceClientId = undefined;
      const sent = w.reply(w.viewer, { type: "screenShareJoin", requestId: "j", streamId: "ts-1" });
      expect(sent.filter((frame) => frame.type === "screenShareError")).toEqual([code("SCREEN_SHARE_SOURCE_UNAVAILABLE", "The share source is temporarily unavailable", { requestId: "j" })]);
    });

    it("SCREEN_SHARE_JOIN_FAILED: TeamSpeak refuses the join, with its own text or the default", async () => {
      for (const [thrown, message, extra] of [[new Error("refused"), "refused", { params: { detail: "refused" } }], ["plain", "Could not join the screen share", {}]] as const) {
        const w = nativeShare({}, { sendProtocolCommand: async () => { throw thrown; } });
        const sent = w.reply(w.viewer, { type: "screenShareJoin", requestId: "j", streamId: "ts-1" });
        await new Promise((resolve) => setImmediate(resolve));
        expect(sent.filter((frame) => frame.type === "screenShareError")).toEqual([code("SCREEN_SHARE_JOIN_FAILED", message, { requestId: "j", ...extra })]);
      }
    });

    it("signalling: SIGNAL_FORBIDDEN, SOURCE_UNAVAILABLE and INVALID_SIGNAL", () => {
      const w = nativeShare();
      const offer = { kind: "offer", sdp: "v=0" } as const;
      expect(w.reply(w.viewer, { type: "screenShareSignal", streamId: "ts-1", targetPeerId: "ts-50", signal: offer })).toEqual([code("SCREEN_SHARE_SIGNAL_FORBIDDEN", "Not allowed to send signals for this screen share")]);
      w.reply(w.viewer, { type: "screenShareJoin", requestId: "j", streamId: "ts-1" });
      expect(w.reply(w.viewer, { type: "screenShareSignal", streamId: "ts-1", targetPeerId: "ts-50", signal: offer })).toEqual([code("SCREEN_SHARE_INVALID_SIGNAL", "A viewer cannot send an offer to a TeamSpeak source")]);
      w.stream.sourceClientId = undefined;
      expect(w.reply(w.viewer, { type: "screenShareSignal", streamId: "ts-1", targetPeerId: "ts-50", signal: offer })).toEqual([code("SCREEN_SHARE_SOURCE_UNAVAILABLE", "The share source is temporarily unavailable")]);
    });

    it("SCREEN_SHARE_SIGNAL_FAILED: TeamSpeak refuses the signal, with its own text or the default", async () => {
      for (const [thrown, message, extra] of [[new Error("refused"), "refused", { params: { detail: "refused" } }], ["plain", "Failed to send the screen share signal", {}]] as const) {
        let refuse = false;
        const w = nativeShare({}, { sendProtocolCommand: async () => { if (refuse) throw thrown; } });
        w.reply(w.viewer, { type: "screenShareJoin", requestId: "j", streamId: "ts-1" });
        await new Promise((resolve) => setImmediate(resolve));
        refuse = true;
        const sent = w.reply(w.viewer, { type: "screenShareSignal", streamId: "ts-1", targetPeerId: "ts-50", signal: { kind: "answer", sdp: "v=0" } });
        await new Promise((resolve) => setImmediate(resolve));
        expect(sent).toEqual([code("SCREEN_SHARE_SIGNAL_FAILED", message, extra)]);
      }
    });
  });

  describe("a browser share that TeamSpeak carries", () => {
    function pairedShare(overrides: Parameters<typeof participant>[1] = {}) {
      const w = world(overrides);
      const started = w.reply(w.owner, { type: "screenShareStart", requestId: "s" });
      const streamId = (started[0].stream as { streamId: string }).streamId;
      handleRawScreenNotification(w.hub, w.owner.entry, { name: "notifystreamstarted", params: { id: "ts-9", clid: "1" } } as never);
      const stream = w.hub.screenStreams.get(screenStreamKey(teamSpeakTargetKey(target), streamId))!;
      return { ...w, stream };
    }

    it("SCREEN_SHARE_PEER_NOT_FOUND: a signal to a native viewer that is not there", () => {
      const w = pairedShare();
      expect(w.reply(w.owner, { type: "screenShareSignal", streamId: w.stream.streamId, targetPeerId: "ts-viewer-77", signal: { kind: "offer", sdp: "v=0" } })).toEqual([code("SCREEN_SHARE_PEER_NOT_FOUND", "The viewer has left")]);
    });

    it("SCREEN_SHARE_INVALID_SIGNAL: an answer from the owner to a native viewer, and SIGNAL_FAILED when TeamSpeak refuses", async () => {
      const w = pairedShare();
      w.stream.nativeViewerClids.add(77);
      expect(w.reply(w.owner, { type: "screenShareSignal", streamId: w.stream.streamId, targetPeerId: "ts-viewer-77", signal: { kind: "answer", sdp: "v=0" } })).toEqual([code("SCREEN_SHARE_INVALID_SIGNAL", "A TeamSpeak viewer cannot send an answer first")]);
      const refusing = pairedShare({ sendProtocolCommand: async () => { throw new Error("refused"); } });
      refusing.stream.nativeViewerClids.add(77);
      const sent = refusing.reply(refusing.owner, { type: "screenShareSignal", streamId: refusing.stream.streamId, targetPeerId: "ts-viewer-77", signal: { kind: "offer", sdp: "v=0" } });
      await new Promise((resolve) => setImmediate(resolve));
      expect(sent).toEqual([code("SCREEN_SHARE_SIGNAL_FAILED", "refused", { params: { detail: "refused" } })]);
    });

    it("SCREEN_SHARE_NATIVE_PUBLISHER_STOPPED: TeamSpeak ends its stream, the owner is told", () => {
      const w = pairedShare();
      w.owner.frames.length = 0;
      handleRawScreenNotification(w.hub, w.owner.entry, { name: "notifystreamstopped", params: { id: "ts-9" } } as never);
      expect(w.owner.frames.filter((frame) => frame.type === "screenShareError")).toEqual([code("SCREEN_SHARE_NATIVE_PUBLISHER_STOPPED", "The TeamSpeak client screen share channel has stopped; the web share can continue")]);
    });
  });

  it("names a browser share after its owner when no name is given", () => {
    const w = world();
    const [started] = w.reply(w.owner, { type: "screenShareStart", requestId: "s" });
    expect((started.stream as { name: string }).name).toBe("owner's screen");
  });
});
