import { WebSocket } from "ws";
import { teamSpeakTargetKey } from "../../shared/teamSpeakTarget.js";
import { buildTeamSpeakCommand } from "../teamspeak/index.js";
import type { ScreenShareStreamDescription, ScreenShareViewerDescription } from "./screenShareProtocol.js";
import type { ScreenShareHost, ScreenShareParticipant } from "./screenShareTypes.js";

export interface ScreenStreamRecord extends ScreenShareStreamDescription {
  targetKey: string;
  channelId: bigint;
  ownerEntryId: string;
  viewerEntryIds: Set<string>;
  sourceClientId?: number;
  /** The gateway TS client that publishes a browser-owned stream to TS6. */
  teamSpeakPublisherEntryId?: string;
  /** The TS6 stream id paired with a browser-owned WebSpeak stream. */
  teamSpeakStreamId?: string;
  /** Native TS6 viewer client ids paired with a browser-owned stream. */
  nativeViewerClids: Set<number>;
}

// Stream ids are per TS server, so the key carries the target and two servers cannot overwrite each other.
export function screenStreamKey(targetKey: string, streamId: string): string {
  return `${targetKey}\u0000${streamId}`;
}

export class ScreenShareHub {
  readonly screenStreams = new Map<string, ScreenStreamRecord>();
  readonly screenStreamDiscoveryTargets = new Set<string>();

  constructor(readonly host: ScreenShareHost) {}

  /** The channel of a client on `targetKey`, from whichever session of this gateway can see it. */
  channelOfClient(targetKey: string, clientId: number): bigint | undefined {
    for (const participant of this.host.participants()) {
      if (teamSpeakTargetKey(participant.target) !== targetKey) continue;
      const channelId = participant.clientChannelId?.(clientId);
      if (channelId !== undefined) return channelId;
    }
    return undefined;
  }

  listScreenStreamsFor(entry: ScreenShareParticipant): ScreenShareStreamDescription[] {
    const targetKey = teamSpeakTargetKey(entry.target);
    return [...this.screenStreams.values()]
      .filter((stream) => stream.targetKey === targetKey && stream.channelId === entry.tsClient.getChannelId())
      .map((stream) => this.describeScreenStream(stream));
  }

  describeScreenStream(stream: ScreenStreamRecord): ScreenShareStreamDescription {
    return {
      streamId: stream.streamId,
      source: stream.source,
      ownerPeerId: stream.ownerPeerId,
      ...(typeof stream.ownerClientId === "number" ? { ownerClientId: stream.ownerClientId } : {}),
      ownerNickname: stream.ownerNickname,
      name: stream.name,
      ...(stream.nameKind ? { nameKind: stream.nameKind } : {}),
      audio: stream.audio,
      createdAt: stream.createdAt,
      viewerCount: stream.viewerCount,
      viewers: this.describeScreenViewers(stream),
    };
  }

  describeScreenViewers(stream: ScreenStreamRecord): ScreenShareViewerDescription[] {
    return [...stream.viewerEntryIds]
      .map((entryId) => this.host.getParticipant(entryId))
      .filter((entry): entry is ScreenShareParticipant => Boolean(entry))
      .slice(0, 64)
      .map((entry) => {
        const avatar = entry.members.get(entry.tsClient.getClientId())?.avatar;
        return {
          peerId: entry.screenPeerId,
          nickname: entry.nickname,
          ...(avatar && avatar.length <= 128 * 1024 ? { avatar } : {}),
        };
      });
  }

  screenShareViewerCountMessage(stream: ScreenStreamRecord): Record<string, unknown> {
    return {
      type: "screenShareViewerCount",
      streamId: stream.streamId,
      viewerCount: stream.viewerCount,
      viewers: this.describeScreenViewers(stream),
    };
  }

  screenShareViewerCount(stream: ScreenStreamRecord): number {
    return stream.viewerEntryIds.size + stream.nativeViewerClids.size;
  }

  broadcastScreenMessage(stream: ScreenStreamRecord, message: Record<string, unknown>, excludeEntryId?: string): void {
    for (const candidate of this.host.participants()) {
      if (candidate.id === excludeEntryId || (candidate.target && teamSpeakTargetKey(candidate.target) !== stream.targetKey)) continue;
      // Streams are scoped to the source channel, don't leak a card or viewer roster to other channels.
      if (candidate.id !== stream.ownerEntryId) {
        try {
          if (candidate.tsClient.getChannelId() !== stream.channelId) continue;
        } catch {
          continue;
        }
      }
      this.sendToEntry(candidate.id, message);
    }
  }

  sendToEntry(entryId: string, message: Record<string, unknown>): void {
    const candidate = this.host.getParticipant(entryId);
    if (candidate?.ws.readyState === WebSocket.OPEN) candidate.ws.send(JSON.stringify(message));
  }

  stopScreenStream(stream: ScreenStreamRecord, reason: string): void {
    if (stream.source === "browser" && stream.teamSpeakStreamId && stream.teamSpeakPublisherEntryId) {
      const publisher = this.host.getParticipant(stream.teamSpeakPublisherEntryId);
      if (publisher) {
        void publisher.tsClient
          .sendProtocolCommand(
            buildTeamSpeakCommand("stopstream", {
              id: stream.teamSpeakStreamId,
              reason: "1",
            }),
          )
          .catch(() => undefined);
      }
    }
    if (!this.screenStreams.delete(screenStreamKey(stream.targetKey, stream.streamId))) return;
    const message = { type: "screenShareStopped", streamId: stream.streamId, reason };
    this.broadcastScreenMessage(stream, message);
    stream.viewerEntryIds.clear();
    stream.nativeViewerClids.clear();
    stream.viewerCount = 0;
  }

  leaveScreenStream(entry: ScreenShareParticipant, stream: ScreenStreamRecord): void {
    if (!stream.viewerEntryIds.delete(entry.id)) return;
    stream.viewerCount = this.screenShareViewerCount(stream);
    if (stream.source === "browser")
      this.sendToEntry(stream.ownerEntryId, { type: "screenShareViewerLeft", streamId: stream.streamId, viewerPeerId: entry.screenPeerId });
    else {
      void entry.tsClient
        .sendProtocolCommand(
          buildTeamSpeakCommand("removeclientfromstream", {
            id: stream.streamId,
            clid: String(entry.tsClient.getClientId()),
          }),
        )
        .catch(() => undefined);
    }
    this.sendToEntry(entry.id, { type: "screenShareLeft", streamId: stream.streamId });
    this.broadcastScreenMessage(stream, this.screenShareViewerCountMessage(stream));
  }

  removeScreenSharePeer(entryId: string): void {
    for (const stream of [...this.screenStreams.values()]) {
      if (stream.ownerEntryId === entryId) {
        this.stopScreenStream(stream, "owner-disconnected");
        continue;
      }
      const entry = this.host.getParticipant(entryId);
      if (entry && stream.viewerEntryIds.has(entryId)) this.leaveScreenStream(entry, stream);
    }
  }

  reconcileScreenShareAfterClientMove(entry: ScreenShareParticipant, movedClientId: number, targetChannelId: bigint): void {
    const targetKey = teamSpeakTargetKey(entry.target);
    // Every session hears every move on the server. The browser rules below only care about this
    // session's own client, the native rule is about the source client.
    const movedIsSelf = movedClientId === entry.tsClient.getClientId();
    for (const stream of [...this.screenStreams.values()]) {
      if (stream.targetKey !== targetKey) continue;
      // A browser share belongs to the user's current channel, stop it on a move so viewers
      // cannot keep a cross-channel peer alive.
      if (movedIsSelf && stream.source === "browser" && stream.ownerEntryId === entry.id && stream.channelId !== targetChannelId) {
        this.stopScreenStream(stream, "owner-moved-channel");
        continue;
      }
      // Native shares are channel-scoped too. Every session sees the notification, so stop the
      // record once the source changes channel.
      if (stream.source === "teamspeak" && stream.sourceClientId === movedClientId) {
        this.stopScreenStream(stream, "source-moved-channel");
        continue;
      }
      if (movedIsSelf && stream.viewerEntryIds.has(entry.id) && stream.channelId !== targetChannelId) {
        this.leaveScreenStream(entry, stream);
      }
    }
  }

  reconcileNativeScreenShareAfterClientLeave(entry: ScreenShareParticipant, clientId: number): void {
    const targetKey = teamSpeakTargetKey(entry.target);
    for (const stream of [...this.screenStreams.values()]) {
      if (stream.targetKey === targetKey && stream.source === "teamspeak" && stream.sourceClientId === clientId) {
        this.stopScreenStream(stream, "source-left");
      }
    }
  }
}
