import { isRecord } from "../../shared/typeGuards.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../../shared/teamSpeakTarget.js";
import type { TSRawNotification } from "../teamspeak/index.js";
import type { ScreenSharePeerSignal } from "./screenShareProtocol.js";
import { ScreenShareHub, screenStreamKey, type ScreenStreamRecord } from "./screenShareHub.js";
import type { ScreenShareParticipant } from "./screenShareTypes.js";

// Screen share sits below voice and cannot import it, so this is a private copy of its parseNumber.
function parseNumber(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function nativeViewerPeerId(clientId: number): string {
  return `ts-viewer-${clientId}`;
}

export function parseNativeViewerPeerId(peerId: string): number | undefined {
  const match = /^ts-viewer-(\d+)$/.exec(peerId);
  if (!match) return undefined;
  return parseNumber(match[1]);
}

export function parseStreamSignalPayload(raw: string): { cmd: string; args: Record<string, unknown> } | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.cmd !== "string" || !isRecord(value.args)) return null;
    return { cmd: value.cmd, args: value.args };
  } catch {
    return null;
  }
}

export function toBrowserScreenSignal(payload: { cmd: string; args: Record<string, unknown> }): ScreenSharePeerSignal | null {
  const args = payload.args;
  // A native TS share source wraps its first SDP in joinResponse after accepting a viewer. The
  // browser expects a normal offer, without this mapping the viewer waits forever.
  if (payload.cmd === "joinResponse") {
    const decision = args.decision;
    if (decision === false || decision === 0 || decision === "0") return { kind: "close" };
    const sdp = typeof args.offer === "string" ? args.offer : typeof args.sdp === "string" ? args.sdp : "";
    return sdp ? { kind: "offer", sdp } : null;
  }
  if (payload.cmd === "offer" || payload.cmd === "reconnectOffer") {
    const sdp = typeof args.offer === "string" ? args.offer : typeof args.sdp === "string" ? args.sdp : "";
    return sdp ? { kind: "offer", sdp } : null;
  }
  if (payload.cmd === "answer") {
    const sdp = typeof args.answer === "string" ? args.answer : typeof args.sdp === "string" ? args.sdp : "";
    return sdp ? { kind: "answer", sdp } : null;
  }
  if (payload.cmd === "iceCandidate") {
    const candidate = typeof args.sdp === "string" ? args.sdp : typeof args.candidate === "string" ? args.candidate : "";
    if (!candidate) return null;
    return {
      kind: "iceCandidate",
      candidate,
      ...(typeof args.mid === "string" ? { sdpMid: args.mid } : {}),
      ...(typeof args.mLine === "number" ? { sdpMLineIndex: args.mLine } : {}),
    };
  }
  return null;
}

/**
 * A session can connect after a native stream started, and TS6 does not replay it in the welcome
 * snapshot. Ask each visible client once per target and let the raw notification path announce it.
 */
export async function discoverExistingTeamSpeakStreams(hub: ScreenShareHub, entry: ScreenShareParticipant): Promise<void> {
  const targetKey = teamSpeakTargetKey(entry.target);
  if (hub.screenStreamDiscoveryTargets.has(targetKey)) return;
  hub.screenStreamDiscoveryTargets.add(targetKey);
  const clientIds = [...entry.members.keys()].filter((clientId) => Number.isInteger(clientId) && clientId > 0);
  for (const clientId of clientIds) {
    if (!entry.tsClient.isConnected()) return;
    try {
      await entry.tsClient.sendProtocolCommand(`requeststreaminfo clid=${clientId}`);
    } catch (error: unknown) {
      hub.host.logger.debug(
        {
          target: formatTeamSpeakTarget(entry.target),
          clientId,
          err: error instanceof Error ? error.message : String(error),
        },
        "Could not query existing TeamSpeak screen stream",
      );
    }
  }
}

export function handleRawScreenNotification(hub: ScreenShareHub, entry: ScreenShareParticipant, notification: TSRawNotification): void {
  const params = notification.params;
  if (notification.name === "notifyjoinstreamrequest") {
    const streamId = params.id || params.stream_id;
    const viewerClientId = parseNumber(params.clid);
    if (!streamId || !viewerClientId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const stream = [...hub.screenStreams.values()].find(
      (candidate) =>
        candidate.targetKey === targetKey &&
        candidate.source === "browser" &&
        candidate.teamSpeakPublisherEntryId === entry.id &&
        candidate.teamSpeakStreamId === streamId,
    );
    if (!stream) return;
    stream.nativeViewerClids.add(viewerClientId);
    stream.viewerCount = hub.screenShareViewerCount(stream);
    hub.sendToEntry(stream.ownerEntryId, {
      type: "screenShareNativeViewerJoined",
      streamId: stream.streamId,
      viewerPeerId: nativeViewerPeerId(viewerClientId),
      viewerClientId,
    });
    hub.broadcastScreenMessage(stream, hub.screenShareViewerCountMessage(stream));
    return;
  }
  if (notification.name === "notifystreamstarted" || notification.name === "notifystreaminfo") {
    const streamId = params.id || params.stream_id;
    const sourceClientId = parseNumber(params.clid);
    if (!streamId || !sourceClientId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const publisherEntry = [...hub.host.participants()].find(
      (candidate) =>
        candidate.target && teamSpeakTargetKey(candidate.target) === targetKey && candidate.tsClient.getClientId() === sourceClientId,
    );
    // Every session on the target gets this notification. If it is the browser share of its source
    // client it must not be announced again as a native stream, pairing twice is harmless.
    const browserStream = publisherEntry
      ? [...hub.screenStreams.values()].find(
          (candidate) =>
            candidate.targetKey === targetKey &&
            candidate.source === "browser" &&
            candidate.teamSpeakPublisherEntryId === publisherEntry.id,
        )
      : undefined;
    if (browserStream) {
      browserStream.teamSpeakStreamId ??= streamId;
      return;
    }
    const sourceEntry = [...hub.host.participants()].find((candidate) => candidate.tsClient.getClientId() === sourceClientId);
    const key = screenStreamKey(targetKey, streamId);
    const current = hub.screenStreams.get(key);
    const stream: ScreenStreamRecord = current ?? {
      streamId,
      source: "teamspeak",
      ownerPeerId: `ts-${sourceClientId}`,
      ownerClientId: sourceClientId,
      ownerNickname: params.name || `TeamSpeak user ${sourceClientId}`,
      name: params.name || "TeamSpeak screen share",
      ...(params.name ? {} : { nameKind: "teamspeakNative" as const }),
      audio: params.audio === "1",
      createdAt: Date.now(),
      viewerCount: 0,
      viewers: [],
      targetKey,
      channelId: sourceEntry?.tsClient.getChannelId() ?? entry.tsClient.getChannelId(),
      ownerEntryId: "",
      viewerEntryIds: new Set(),
      nativeViewerClids: new Set(),
      sourceClientId,
    };
    stream.sourceClientId = sourceClientId;
    stream.ownerNickname = params.name || stream.ownerNickname;
    stream.name = params.name || stream.name;
    if (params.name) delete stream.nameKind;
    stream.audio = params.audio === "1";
    hub.screenStreams.set(key, stream);
    // Every session on the same target sees this notification, only the first one announces a
    // new stream or viewers get duplicate cards.
    if (!current) {
      hub.broadcastScreenMessage(stream, { type: "screenShareStarted", stream: hub.describeScreenStream(stream), owner: false });
    }
    return;
  }
  if (notification.name === "notifystreamstopped") {
    const streamId = params.id || params.stream_id;
    if (!streamId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const stream = hub.screenStreams.get(screenStreamKey(targetKey, streamId));
    if (stream) {
      hub.stopScreenStream(stream, "source-stopped");
      return;
    }
    const browserStream = [...hub.screenStreams.values()].find(
      (candidate) => candidate.targetKey === targetKey && candidate.source === "browser" && candidate.teamSpeakStreamId === streamId,
    );
    if (browserStream) {
      browserStream.teamSpeakStreamId = undefined;
      browserStream.nativeViewerClids.clear();
      browserStream.viewerCount = hub.screenShareViewerCount(browserStream);
      hub.sendToEntry(browserStream.ownerEntryId, {
        type: "screenShareError",
        code: "SCREEN_SHARE_NATIVE_PUBLISHER_STOPPED",
        message: "The TeamSpeak client screen share channel has stopped; the web share can continue",
      });
      hub.broadcastScreenMessage(browserStream, hub.screenShareViewerCountMessage(browserStream));
    }
    return;
  }
  if (notification.name === "notifystreamclientleft") {
    const streamId = params.id || params.stream_id;
    const viewerClientId = parseNumber(params.clid);
    if (!streamId || !viewerClientId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const stream = [...hub.screenStreams.values()].find(
      (candidate) =>
        candidate.targetKey === targetKey &&
        candidate.source === "browser" &&
        candidate.teamSpeakStreamId === streamId &&
        candidate.nativeViewerClids.has(viewerClientId),
    );
    if (!stream) return;
    stream.nativeViewerClids.delete(viewerClientId);
    stream.viewerCount = hub.screenShareViewerCount(stream);
    hub.sendToEntry(stream.ownerEntryId, {
      type: "screenShareViewerLeft",
      streamId: stream.streamId,
      viewerPeerId: nativeViewerPeerId(viewerClientId),
    });
    hub.broadcastScreenMessage(stream, hub.screenShareViewerCountMessage(stream));
    return;
  }
  if (notification.name === "notifyrespondjoinstreamrequest" || notification.name === "notifystreamsignaling") {
    const streamId = params.id || params.stream_id;
    if (!streamId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const browserStream =
      notification.name === "notifystreamsignaling"
        ? [...hub.screenStreams.values()].find(
            (candidate) =>
              candidate.targetKey === targetKey &&
              candidate.source === "browser" &&
              candidate.teamSpeakPublisherEntryId === entry.id &&
              candidate.teamSpeakStreamId === streamId,
          )
        : undefined;
    if (browserStream) {
      const viewerClientId = parseNumber(params.clid);
      if (!viewerClientId || !browserStream.nativeViewerClids.has(viewerClientId)) return;
      const payload = parseStreamSignalPayload(params.json || params.data || "");
      if (!payload) return;
      const signal = toBrowserScreenSignal(payload);
      if (!signal) return;
      hub.sendToEntry(browserStream.ownerEntryId, {
        type: "screenShareSignal",
        streamId: browserStream.streamId,
        fromPeerId: nativeViewerPeerId(viewerClientId),
        signal,
      });
      return;
    }
    const stream = hub.screenStreams.get(screenStreamKey(targetKey, streamId));
    if (!stream || stream.source !== "teamspeak" || !stream.viewerEntryIds.has(entry.id)) return;
    const payload =
      notification.name === "notifyrespondjoinstreamrequest"
        ? { cmd: "offer", args: { offer: params.offer || "" } }
        : parseStreamSignalPayload(params.json || params.data || "");
    if (!payload) return;
    const signal = toBrowserScreenSignal(payload);
    if (!signal) return;
    hub.sendToEntry(entry.id, { type: "screenShareSignal", streamId, fromPeerId: stream.ownerPeerId, signal });
  }
}
