import { randomUUID } from "node:crypto";
import { buildTeamSpeakCommand } from "../teamspeak/index.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../../shared/teamSpeakTarget.js";
import type { ScreenShareClientMessage, ScreenSharePeerSignal } from "./screenShareProtocol.js";
import { ScreenShareHub, screenStreamKey, type ScreenStreamRecord } from "./screenShareHub.js";
import { parseNativeViewerPeerId } from "./screenShareNative.js";
import type { ScreenShareParticipant } from "./screenShareTypes.js";

export function handleScreenShareMessage(
  hub: ScreenShareHub,
  entry: ScreenShareParticipant,
  message: ScreenShareClientMessage,
  sendJson: (message: Record<string, unknown>) => void,
): void {
  if (message.type === "screenShareList") {
    sendJson({ type: "screenShareList", streams: hub.listScreenStreamsFor(entry) });
    return;
  }

  if (message.type === "screenShareStart") {
    if ([...hub.screenStreams.values()].some((stream) => stream.source === "browser" && stream.ownerEntryId === entry.id)) {
      sendJson({
        type: "screenShareError",
        requestId: message.requestId,
        code: "SCREEN_SHARE_ALREADY_ACTIVE",
        message: "You are already sharing your screen",
      });
      return;
    }
    const stream: ScreenStreamRecord = {
      streamId: `screen-${randomUUID()}`,
      source: "browser",
      ownerPeerId: entry.screenPeerId,
      ownerClientId: entry.tsClient.getClientId() || undefined,
      ownerNickname: entry.nickname,
      name: message.name?.trim() || `${entry.nickname}'s screen`,
      ...(message.name?.trim() ? {} : { nameKind: "ownerScreen" as const }),
      audio: message.audio === true,
      createdAt: Date.now(),
      viewerCount: 0,
      viewers: [],
      targetKey: teamSpeakTargetKey(entry.target),
      channelId: entry.tsClient.getChannelId(),
      ownerEntryId: entry.id,
      viewerEntryIds: new Set(),
      teamSpeakPublisherEntryId: entry.id,
      nativeViewerClids: new Set(),
    };
    hub.screenStreams.set(screenStreamKey(stream.targetKey, stream.streamId), stream);
    sendJson({ type: "screenShareStarted", requestId: message.requestId, stream: hub.describeScreenStream(stream), owner: true });
    hub.broadcastScreenMessage(
      stream,
      {
        type: "screenShareStarted",
        stream: hub.describeScreenStream(stream),
        owner: false,
      },
      entry.id,
    );
    void publishBrowserScreenStream(hub, entry, stream);
    return;
  }

  const stream = hub.screenStreams.get(screenStreamKey(teamSpeakTargetKey(entry.target), message.streamId));
  if (!stream) {
    sendJson({
      type: "screenShareError",
      requestId: "requestId" in message ? message.requestId : undefined,
      code: "SCREEN_SHARE_NOT_FOUND",
      message: "The screen share has ended or does not exist",
    });
    return;
  }
  if (stream.targetKey !== teamSpeakTargetKey(entry.target) || stream.channelId !== entry.tsClient.getChannelId()) {
    sendJson({
      type: "screenShareError",
      requestId: "requestId" in message ? message.requestId : undefined,
      code: "SCREEN_SHARE_TARGET_MISMATCH",
      message: "The screen share does not belong to the current server or channel",
    });
    return;
  }

  if (message.type === "screenShareStop") {
    if (stream.ownerEntryId !== entry.id) {
      sendJson({
        type: "screenShareError",
        requestId: message.requestId,
        code: "SCREEN_SHARE_NOT_OWNER",
        message: "Only the sharer can end the share",
      });
      return;
    }
    hub.stopScreenStream(stream, "owner-stopped");
    if (message.requestId) sendJson({ type: "screenShareCompleted", requestId: message.requestId });
    return;
  }

  if (message.type === "screenShareJoin") {
    if (stream.ownerEntryId === entry.id) {
      sendJson({
        type: "screenShareError",
        requestId: message.requestId,
        code: "SCREEN_SHARE_OWNER_CANNOT_JOIN",
        message: "The sharer cannot join their own share as a viewer",
      });
      return;
    }
    const alreadyJoined = stream.viewerEntryIds.has(entry.id);
    if (!alreadyJoined) stream.viewerEntryIds.add(entry.id);
    stream.viewerCount = hub.screenShareViewerCount(stream);
    sendJson({
      type: "screenShareJoined",
      requestId: message.requestId,
      stream: hub.describeScreenStream(stream),
      ownerPeerId: stream.ownerPeerId,
      mode: stream.source,
    });
    if (stream.source === "browser" && !alreadyJoined) {
      hub.sendToEntry(stream.ownerEntryId, {
        type: "screenShareViewerJoined",
        streamId: stream.streamId,
        viewerPeerId: entry.screenPeerId,
        viewerNickname: entry.nickname,
      });
    } else if (stream.source === "teamspeak" && !alreadyJoined) {
      void joinNativeScreenStream(hub, entry, stream, sendJson, message.requestId);
    }
    if (!alreadyJoined) {
      hub.broadcastScreenMessage(stream, hub.screenShareViewerCountMessage(stream));
    }
    return;
  }

  if (message.type === "screenShareLeave") {
    hub.leaveScreenStream(entry, stream);
    if (message.requestId) sendJson({ type: "screenShareCompleted", requestId: message.requestId });
    return;
  }

  if (message.type === "screenShareSignal") {
    relayScreenShareSignal(hub, entry, stream, message.targetPeerId, message.signal, sendJson);
  }
}

function relayScreenShareSignal(
  hub: ScreenShareHub,
  entry: ScreenShareParticipant,
  stream: ScreenStreamRecord,
  targetPeerId: string,
  signal: ScreenSharePeerSignal,
  sendJson: (message: Record<string, unknown>) => void,
): void {
  if (stream.source === "teamspeak") {
    if (!stream.viewerEntryIds.has(entry.id) || targetPeerId !== stream.ownerPeerId) {
      sendJson({
        type: "screenShareError",
        code: "SCREEN_SHARE_SIGNAL_FORBIDDEN",
        message: "Not allowed to send signals for this screen share",
      });
      return;
    }
    const sourceClientId = stream.sourceClientId;
    if (!sourceClientId) {
      sendJson({
        type: "screenShareError",
        code: "SCREEN_SHARE_SOURCE_UNAVAILABLE",
        message: "The share source is temporarily unavailable",
      });
      return;
    }
    if (signal.kind === "close") {
      hub.leaveScreenStream(entry, stream);
      return;
    }
    if (signal.kind === "offer") {
      sendJson({
        type: "screenShareError",
        code: "SCREEN_SHARE_INVALID_SIGNAL",
        message: "A viewer cannot send an offer to a TeamSpeak source",
      });
      return;
    }
    const payload =
      signal.kind === "iceCandidate"
        ? {
            cmd: "iceCandidate",
            args: {
              sdp: signal.candidate,
              ...(signal.sdpMid !== undefined ? { mid: signal.sdpMid } : {}),
              ...(signal.sdpMLineIndex !== undefined ? { mLine: signal.sdpMLineIndex } : {}),
            },
          }
        : { cmd: "answer", args: { answer: signal.sdp } };
    void entry.tsClient
      .sendProtocolCommand(
        buildTeamSpeakCommand("streamsignaling", {
          id: stream.streamId,
          clid: String(sourceClientId),
          json: JSON.stringify(payload),
        }),
      )
      .catch((error: unknown) => {
        sendJson(failureFrame("SCREEN_SHARE_SIGNAL_FAILED", error, "Failed to send the screen share signal"));
      });
    return;
  }

  if (stream.source === "browser" && entry.id === stream.ownerEntryId && targetPeerId.startsWith("ts-viewer-")) {
    const viewerClid = parseNativeViewerPeerId(targetPeerId);
    const publisher = stream.teamSpeakPublisherEntryId ? hub.host.getParticipant(stream.teamSpeakPublisherEntryId) : undefined;
    if (!viewerClid || !publisher || !stream.teamSpeakStreamId || !stream.nativeViewerClids.has(viewerClid)) {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_PEER_NOT_FOUND", message: "The viewer has left" });
      return;
    }
    if (signal.kind === "close") {
      void publisher.tsClient
        .sendProtocolCommand(
          buildTeamSpeakCommand("removeclientfromstream", {
            id: stream.teamSpeakStreamId,
            clid: String(viewerClid),
          }),
        )
        .catch(() => undefined);
      stream.nativeViewerClids.delete(viewerClid);
      stream.viewerCount = hub.screenShareViewerCount(stream);
      hub.sendToEntry(entry.id, { type: "screenShareViewerLeft", streamId: stream.streamId, viewerPeerId: targetPeerId });
      hub.broadcastScreenMessage(stream, hub.screenShareViewerCountMessage(stream));
      return;
    }
    if (signal.kind === "answer") {
      sendJson({
        type: "screenShareError",
        code: "SCREEN_SHARE_INVALID_SIGNAL",
        message: "A TeamSpeak viewer cannot send an answer first",
      });
      return;
    }
    let command: string;
    if (signal.kind === "offer") {
      command = buildTeamSpeakCommand("respondjoinstreamrequest", {
        id: stream.teamSpeakStreamId,
        clid: String(viewerClid),
        msg: "",
        offer: signal.sdp,
        decision: "1",
      });
    } else if (signal.kind === "iceCandidate") {
      command = buildTeamSpeakCommand("streamsignaling", {
        id: stream.teamSpeakStreamId,
        clid: String(viewerClid),
        json: JSON.stringify({
          cmd: "iceCandidate",
          args: {
            sdp: signal.candidate,
            ...(signal.sdpMid !== undefined ? { mid: signal.sdpMid } : {}),
            ...(signal.sdpMLineIndex !== undefined ? { mLine: signal.sdpMLineIndex } : {}),
          },
        }),
      });
    } else {
      return;
    }
    void publisher.tsClient.sendProtocolCommand(command).catch((error: unknown) => {
      sendJson(failureFrame("SCREEN_SHARE_SIGNAL_FAILED", error, "Failed to send the screen share signal"));
    });
    return;
  }

  const owner = hub.host.getParticipant(stream.ownerEntryId);
  const isOwner = entry.id === stream.ownerEntryId;
  const isViewer = stream.viewerEntryIds.has(entry.id);
  if (!owner || (!isOwner && !isViewer)) {
    sendJson({
      type: "screenShareError",
      code: "SCREEN_SHARE_SIGNAL_FORBIDDEN",
      message: "Not allowed to send signals for this screen share",
    });
    return;
  }
  // Keep the P2P graph bipartite, the owner may signal only an active viewer and a viewer only the
  // owner, or a viewer could inject SDP/ICE into another viewer's peer.
  const targetEntry = isOwner
    ? [...stream.viewerEntryIds].map((id) => hub.host.getParticipant(id)).find((candidate) => candidate?.screenPeerId === targetPeerId)
    : targetPeerId === owner.screenPeerId
      ? owner
      : undefined;
  if (!targetEntry || targetEntry.id === entry.id) {
    sendJson({ type: "screenShareError", code: "SCREEN_SHARE_PEER_NOT_FOUND", message: "The viewer has left" });
    return;
  }
  hub.sendToEntry(targetEntry.id, { type: "screenShareSignal", streamId: stream.streamId, fromPeerId: entry.screenPeerId, signal });
}

async function publishBrowserScreenStream(hub: ScreenShareHub, entry: ScreenShareParticipant, stream: ScreenStreamRecord): Promise<void> {
  try {
    await entry.tsClient.sendProtocolCommand(
      buildTeamSpeakCommand("setupstream", {
        name: stream.name,
        type: "3",
        bitrate: "4608",
        accessibility: "1",
        mode: "1",
        viewer_limit: "0",
        audio: stream.audio ? "1" : "0",
      }),
    );
  } catch (error: unknown) {
    hub.host.logger.warn(
      {
        target: formatTeamSpeakTarget(entry.target),
        streamId: stream.streamId,
        err: error instanceof Error ? error.message : String(error),
      },
      "Could not publish browser screen share to TeamSpeak",
    );
  }
}

async function joinNativeScreenStream(
  hub: ScreenShareHub,
  entry: ScreenShareParticipant,
  stream: ScreenStreamRecord,
  sendJson: (message: Record<string, unknown>) => void,
  requestId?: string,
): Promise<void> {
  const sourceClientId = stream.sourceClientId;
  if (!entry.tsClient.getClientId() || !sourceClientId) {
    sendJson({
      type: "screenShareError",
      requestId,
      code: "SCREEN_SHARE_SOURCE_UNAVAILABLE",
      message: "The share source is temporarily unavailable",
    });
    return;
  }
  try {
    await entry.tsClient.sendProtocolCommand(
      buildTeamSpeakCommand("joinstreamrequest", {
        id: stream.streamId,
        // TS6 takes the source client id on joinstreamrequest, our session is identified later by the
        // response notification on this connection.
        clid: String(sourceClientId),
        msg: "",
        is_remove: "0",
        muted: "0",
        volume: "0",
        hidden: "0",
      }),
    );
  } catch (error: unknown) {
    hub.leaveScreenStream(entry, stream);
    sendJson(failureFrame("SCREEN_SHARE_JOIN_FAILED", error, "Could not join the screen share", requestId));
  }
}

const MAX_DETAIL_LENGTH = 160;

/**
 * A screenShareError for a failed TS command. The error text goes in message and, capped and stripped
 * of control characters, in params.detail so the browser never parses message.
 */
function failureFrame(
  code: "SCREEN_SHARE_SIGNAL_FAILED" | "SCREEN_SHARE_JOIN_FAILED",
  error: unknown,
  fallback: string,
  requestId?: string,
): Record<string, unknown> {
  const detail =
    error instanceof Error
      ? error.message
          // eslint-disable-next-line no-control-regex -- control characters are exactly what is stripped
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_DETAIL_LENGTH)
      : "";
  return {
    type: "screenShareError",
    ...(requestId !== undefined ? { requestId } : {}),
    code,
    message: error instanceof Error ? error.message : fallback,
    ...(detail ? { params: { detail } } : {}),
  };
}
