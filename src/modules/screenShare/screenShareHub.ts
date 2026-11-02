import { WebSocket } from "ws";
import { teamSpeakTargetKey } from "../../shared/teamSpeakTarget.js";
import { buildTeamSpeakCommand } from "../teamspeak/index.js";
import type { ScreenShareStreamDescription, ScreenShareViewerDescription } from "./screenShareProtocol.js";
import type { ScreenShareHost, ScreenShareParticipant, ScreenShareSendOptions } from "./screenShareTypes.js";

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

  readonly #queuedSignals = new Map<string, { streamKey: string; senderEntryId: string; remote: string; abort: AbortController }>();

  constructor(readonly host: ScreenShareHost) {}

  /** Signalling goes behind interactive commands (a channel switch) and dies with the stream, the sender or the peer it was for. */
  signalSendOptions(stream: ScreenStreamRecord, senderEntryId: string, remote: string | number): ScreenShareSendOptions {
    const streamKey = screenStreamKey(stream.targetKey, stream.streamId);
    const key = `${streamKey}\u0000${senderEntryId}\u0000${remote}`;
    let queued = this.#queuedSignals.get(key);
    if (!queued) {
      queued = { streamKey, senderEntryId, remote: String(remote), abort: new AbortController() };
      this.#queuedSignals.set(key, queued);
    }
    return { priority: "bulk", signal: queued.abort.signal };
  }

  /** Drops what is still queued for the stream, narrowed to one sender and, if given, one remote peer. */
  dropQueuedSignals(stream: ScreenStreamRecord, senderEntryId?: string, remote?: string | number): void {
    const streamKey = screenStreamKey(stream.targetKey, stream.streamId);
    for (const [key, queued] of this.#queuedSignals) {
      if (queued.streamKey !== streamKey) continue;
      if (senderEntryId !== undefined && queued.senderEntryId !== senderEntryId) continue;
      if (remote !== undefined && queued.remote !== String(remote)) continue;
      queued.abort.abort();
      this.#queuedSignals.delete(key);
    }
  }

  /** The channel of a client on `targetKey`, from whichever session of this gateway can see it. */
  channelOfClient(targetKey: string, clientId: number): bigint | undefined {
    for (const participant of this.host.participants()) {
      if (teamSpeakTargetKey(participant.target) !== targetKey) continue;
      const channelId = participant.clientChannelId?.(clientId);
      if (channelId !== undefined) return channelId;
    }
    return undefined;
  }

  /** The client ids that own a stream on `targetKey`, in any channel. */
  sharingClientIds(targetKey: string): number[] {
    const ids = new Set<number>();
    for (const stream of this.screenStreams.values()) {
      if (stream.targetKey === targetKey && typeof stream.ownerClientId === "number") ids.add(stream.ownerClientId);
    }
    return [...ids].sort((a, b) => a - b);
  }

  /** Tells every session on the target who is sharing, so a member list can show it whatever channel the sharer is in. */
  announceSharing(targetKey: string): void {
    const message = { type: "sharingMembers", clientIds: this.sharingClientIds(targetKey) };
    for (const candidate of this.host.participants()) {
      if (candidate.target && teamSpeakTargetKey(candidate.target) === targetKey) this.sendToEntry(candidate.id, message);
    }
  }

  /** The streams in the entry's channel, or in `channelId` while the entry is still being moved there. */
  listScreenStreamsFor(entry: ScreenShareParticipant, channelId: bigint = entry.tsClient.getChannelId()): ScreenShareStreamDescription[] {
    const targetKey = teamSpeakTargetKey(entry.target);
    return [...this.screenStreams.values()]
      .filter((stream) => stream.targetKey === targetKey && stream.channelId === channelId)
      .map((stream) => this.describeScreenStream(stream));
  }

  describeScreenStream(stream: ScreenStreamRecord): ScreenShareStreamDescription {
    const viewers = this.describeScreenViewers(stream);
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
      // The roster above prunes viewers that vanished, so the count can never disagree with it.
      viewerCount: stream.viewerCount,
      viewers,
    };
  }

  /**
   * Who is watching, for the player's avatar stack. Carries the TeamSpeak client id.
   */
  describeScreenViewers(stream: ScreenStreamRecord): ScreenShareViewerDescription[] {
    this.pruneVanishedViewers(stream);
    return [...stream.viewerEntryIds]
      .map((entryId) => this.host.getParticipant(entryId))
      .filter((entry): entry is ScreenShareParticipant => Boolean(entry))
      .slice(0, 64)
      .map((entry) => {
        const clientId = entry.tsClient.getClientId();
        return { peerId: entry.screenPeerId, nickname: entry.nickname, ...(clientId > 0 ? { clientId } : {}) };
      });
  }

  /** A participant that disappeared without passing through the leave path would otherwise inflate the count for the stream's lifetime. */
  private pruneVanishedViewers(stream: ScreenStreamRecord): void {
    for (const entryId of stream.viewerEntryIds) if (!this.host.getParticipant(entryId)) stream.viewerEntryIds.delete(entryId);
    stream.viewerCount = stream.viewerEntryIds.size + stream.nativeViewerClids.size;
  }

  screenShareViewerCountMessage(stream: ScreenStreamRecord): Record<string, unknown> {
    const viewers = this.describeScreenViewers(stream);
    return {
      type: "screenShareViewerCount",
      streamId: stream.streamId,
      viewerCount: stream.viewerCount,
      viewers,
    };
  }

  screenShareViewerCount(stream: ScreenStreamRecord): number {
    this.pruneVanishedViewers(stream);
    return stream.viewerCount;
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
    this.dropQueuedSignals(stream);
    if (!this.screenStreams.delete(screenStreamKey(stream.targetKey, stream.streamId))) return;
    const message = { type: "screenShareStopped", streamId: stream.streamId, reason };
    this.broadcastScreenMessage(stream, message);
    this.announceSharing(stream.targetKey);
    stream.viewerEntryIds.clear();
    stream.nativeViewerClids.clear();
    stream.viewerCount = 0;
  }

  /** `serverDropped`: the server already removed the viewer (it changed channel), so there is nothing to clean up there. */
  leaveScreenStream(entry: ScreenShareParticipant, stream: ScreenStreamRecord, serverDropped = false): void {
    if (!stream.viewerEntryIds.delete(entry.id)) return;
    this.dropQueuedSignals(stream, entry.id);
    stream.viewerCount = this.screenShareViewerCount(stream);
    if (stream.source === "browser")
      this.sendToEntry(stream.ownerEntryId, { type: "screenShareViewerLeft", streamId: stream.streamId, viewerPeerId: entry.screenPeerId });
    else if (!serverDropped) {
      void entry.tsClient
        .sendProtocolCommand(
          buildTeamSpeakCommand("removeclientfromstream", {
            id: stream.streamId,
            clid: String(entry.tsClient.getClientId()),
            reason: "1",
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
        this.leaveScreenStream(entry, stream, true);
      }
    }
    // The browser only asked for the list when it connected, so the shares of the new channel have to be pushed.
    if (movedIsSelf) this.sendToEntry(entry.id, { type: "screenShareList", streams: this.listScreenStreamsFor(entry, targetChannelId) });
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
