import type { EventEmitter } from "node:events";
import { directoryClient, ReasonId, type ConnectionEventMap, type SessionClient, type SessionView } from "../../lib/teamspeak/index.js";
import { normalizeTeamSpeakKickedReason } from "../../shared/errors.js";
import type { TeamSpeakBackendEvents } from "./teamSpeakBackend.js";

export interface EventSource {
  readonly session: SessionView;
  on<K extends keyof ConnectionEventMap>(type: K, listener: (...args: ConnectionEventMap[K]) => void): unknown;
}

const KICK_REASONS: ReadonlySet<number> = new Set([ReasonId.kickedFromChannel, ReasonId.kickedFromServer, ReasonId.banned]);

/**
 * Hands the lib's session events on in TSClient's event shapes. The voice module only learns about
 * channel changes from full snapshots, so every channel event is followed by one.
 */
export function forwardConnectionEvents(source: EventSource, target: EventEmitter<TeamSpeakBackendEvents>): void {
  const snapshot = () => target.emit("directorySnapshot", source.session.snapshot());
  const leaveOutOfView = (clients: readonly SessionClient[]) => {
    for (const client of clients) target.emit("clientLeave", { id: client.id, reasonID: 0, reasonMsg: "", targetID: 0 });
  };

  source.on("welcomeComplete", snapshot);
  source.on("clientEnter", (event) => target.emit("clientEnter", directoryClient(event.client)));
  source.on("clientLeave", (event) =>
    target.emit("clientLeave", {
      id: event.client.id,
      reasonID: event.reasonId,
      reasonMsg: event.reasonMessage,
      targetID: Number(event.toChannelId),
    }),
  );
  source.on("clientMoved", (event) =>
    target.emit("clientMoved", {
      id: event.client.id,
      targetChannelID: event.client.channelId,
      reasonID: event.reasonId,
      invokerID: event.invoker?.id ?? 0,
      invokerName: event.invoker?.name ?? "",
      invokerUID: event.invoker?.uid ?? "",
    }),
  );
  source.on("clientUpdated", (event) => target.emit("clientUpdated", directoryClient(event.client)));
  source.on("selfLeft", (event) => {
    if (KICK_REASONS.has(event.reasonId)) target.emit("kicked", normalizeTeamSpeakKickedReason(event.reasonMessage, event.reasonId));
  });
  source.on("channelCreated", snapshot);
  source.on("channelEdited", snapshot);
  source.on("channelMoved", snapshot);
  source.on("channelsSubscribed", snapshot);
  source.on("channelDeleted", (event) => {
    leaveOutOfView(event.clients);
    snapshot();
  });
  source.on("channelsUnsubscribed", (event) => {
    leaveOutOfView(event.clients);
    snapshot();
  });
  source.on("textMessage", (event) =>
    target.emit("textMessage", {
      invokerName: event.invoker.name,
      invokerId: event.invoker.id,
      invokerUid: event.invoker.uid,
      message: event.message,
      targetMode: event.targetMode,
      targetId: BigInt(event.targetClientId ?? 0),
    }),
  );
  source.on("poked", (event) =>
    target.emit("poked", {
      invokerID: event.invoker.id,
      invokerName: event.invoker.name,
      invokerUID: event.invoker.uid,
      message: event.message,
    }),
  );
  source.on("notification", (event) => {
    for (const row of event.command.rows) target.emit("rawNotification", { name: event.command.name, params: { ...row } });
  });
  source.on("voice", (event) => {
    // An empty frame ends a transmission. The downlink never got one from the old SDK and has no use for it.
    if (event.data.length === 0) return;
    target.emit("voiceData", { clientId: event.clientId, codec: event.codec, data: Buffer.from(event.data) });
  });
  source.on("closed", (event) => target.emit("disconnected", event.error));
}
