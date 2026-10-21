import type { ServerCommand } from "../command/commandTracker.js";
import type { CommandRow } from "../wire/commandRows.js";
import { parseI32, parseU16, parseU64, parseU8 } from "../wire/commandValues.js";
import type { ChannelTree, SessionChannel } from "./channelTree.js";
import { type ClientRegistry, clientIdOf } from "./clientRegistry.js";
import { type Invoker, invokerOf } from "./propertyFields.js";
import { readGroups, readServer, type SessionGroup, type SessionServer } from "./serverInfo.js";
import type { SessionEvent } from "./sessionEvents.js";

/** The parts of the session state a notification changes. */
export interface SessionParts {
  selfId: number;
  readonly channels: ChannelTree;
  readonly clients: ClientRegistry;
  server: SessionServer;
  serverGroups: ReadonlyMap<number, SessionGroup>;
  channelGroups: ReadonlyMap<number, SessionGroup>;
}

type Apply = (parts: SessionParts, rows: readonly CommandRow[]) => SessionEvent[];

const channelIdOf = (row: CommandRow, key = "cid") => parseU64(row[key]);
const reasonOf = (row: CommandRow) => parseU8(row.reasonid) ?? 0;
const serverInvoker = (row: CommandRow): Invoker => invokerOf(row) ?? { id: 0, name: "", uid: "" };

const clientEnter: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const client = parts.clients.enter(row, channelIdOf(row, "ctid") ?? 0n);
    if (!client) return [];
    return [
      { type: "clientEnter", client, fromChannelId: channelIdOf(row, "cfid") ?? 0n, reasonId: reasonOf(row), invoker: invokerOf(row) },
    ];
  });

const clientLeave: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const id = clientIdOf(row);
    if (id === undefined) return [];
    const reasonId = reasonOf(row);
    const reasonMessage = row.reasonmsg ?? "";
    const invoker = invokerOf(row);
    const client = parts.clients.remove(id);
    const events: SessionEvent[] = [];
    if (client) events.push({ type: "clientLeave", client, toChannelId: channelIdOf(row, "ctid") ?? 0n, reasonId, reasonMessage, invoker });
    if (id === parts.selfId) {
      const banTime = parseI32(row.bantime);
      events.push({ type: "selfLeft", reasonId, reasonMessage, invoker, banTime });
    }
    return events;
  });

const clientMoved: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const id = clientIdOf(row);
    const to = channelIdOf(row, "ctid");
    const previous = id === undefined ? undefined : parts.clients.get(id);
    if (!previous || to === undefined) return [];
    const client = parts.clients.move(previous.id, to)!;
    return [{ type: "clientMoved", client, fromChannelId: previous.channelId, reasonId: reasonOf(row), invoker: invokerOf(row) }];
  });

const clientUpdated: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const result = parts.clients.update(row);
    return result ? [{ type: "clientUpdated", ...result }] : [];
  });

// Comes on every channel join, with the group the client has in its new channel.
const channelGroupChanged: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const result = row.cgid === undefined ? undefined : parts.clients.update({ clid: row.clid, client_channel_group_id: row.cgid });
    return result?.changed.length ? [{ type: "clientUpdated", ...result }] : [];
  });

const channelCreated: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const channel = parts.channels.create(row);
    return channel ? [{ type: "channelCreated", channel, invoker: invokerOf(row) }] : [];
  });

const channelEdited: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const result = parts.channels.edit(row);
    if (!result) return [];
    return [{ type: "channelEdited", channel: result.channel, changed: result.changed, invoker: invokerOf(row) }];
  });

const channelMoved: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const result = parts.channels.edit(row);
    if (!result) return [];
    return [{ type: "channelMoved", channel: result.channel, fromParentId: result.previous.parentId, invoker: invokerOf(row) }];
  });

const channelDeleted: Apply = (parts, rows) =>
  rows.flatMap((row): SessionEvent[] => {
    const channels = parts.channels.delete(channelIdOf(row) ?? 0n);
    if (channels.length === 0) return [];
    const clients = parts.clients.removeIn(new Set(channels.map((channel) => channel.id)), parts.selfId);
    return [{ type: "channelDeleted", channels, clients, invoker: invokerOf(row) }];
  });

function subscription(parts: SessionParts, rows: readonly CommandRow[], subscribed: boolean): SessionChannel[] {
  return rows.flatMap((row) => parts.channels.setSubscribed(channelIdOf(row) ?? 0n, subscribed) ?? []);
}

const channelsSubscribed: Apply = (parts, rows) => {
  const channels = subscription(parts, rows, true);
  return channels.length ? [{ type: "channelsSubscribed", channels }] : [];
};

// The server sends no leave for the clients of an unsubscribed channel, they just go out of view.
const channelsUnsubscribed: Apply = (parts, rows) => {
  const channels = subscription(parts, rows, false);
  if (channels.length === 0) return [];
  const clients = parts.clients.removeIn(new Set(channels.map((channel) => channel.id)), parts.selfId);
  return [{ type: "channelsUnsubscribed", channels, clients }];
};

const serverUpdated: Apply = (parts, rows) => {
  const { server, changed } = readServer(rows[0], parts.server);
  parts.server = server;
  return [{ type: "serverUpdated", server, changed, invoker: invokerOf(rows[0]) }];
};

const textMessage: Apply = (_parts, rows) =>
  rows.map((row) => ({
    type: "textMessage",
    targetMode: parseU8(row.targetmode) ?? 0,
    targetClientId: parseU16(row.target),
    message: row.msg ?? "",
    invoker: serverInvoker(row),
  }));

const poked: Apply = (_parts, rows) => rows.map((row) => ({ type: "poked", message: row.msg ?? "", invoker: serverInvoker(row) }));

const APPLY: Readonly<Record<string, Apply>> = {
  notifycliententerview: clientEnter,
  notifyclientleftview: clientLeave,
  notifyclientmoved: clientMoved,
  notifyclientupdated: clientUpdated,
  notifyclientchannelgroupchanged: channelGroupChanged,
  notifychannelcreated: channelCreated,
  notifychanneledited: channelEdited,
  notifychannelmoved: channelMoved,
  notifychanneldeleted: channelDeleted,
  notifychannelsubscribed: channelsSubscribed,
  notifychannelunsubscribed: channelsUnsubscribed,
  notifyserveredited: serverUpdated,
  notifyserverupdated: serverUpdated,
  notifyservergrouplist: (parts, rows) => {
    parts.serverGroups = readGroups(rows, "sgid");
    return [{ type: "groupsUpdated", kind: "server" }];
  },
  notifychannelgrouplist: (parts, rows) => {
    parts.channelGroups = readGroups(rows, "cgid");
    return [{ type: "groupsUpdated", kind: "channel" }];
  },
  notifytextmessage: textMessage,
  notifyclientpoke: poked,
};

/** Applies a notification and returns what changed, or undefined for one the session does not handle. */
export function applyNotification(parts: SessionParts, command: ServerCommand): SessionEvent[] | undefined {
  return Object.hasOwn(APPLY, command.name) ? APPLY[command.name](parts, command.rows) : undefined;
}
