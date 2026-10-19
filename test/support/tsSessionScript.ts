// Feeds server command texts into a SessionState of the own TeamSpeak client, for the session tests.
import type { SessionEvent } from "../../src/lib/teamspeak/session/sessionEvents.js";
import { SessionState } from "../../src/lib/teamspeak/session/sessionState.js";
import { buildCommand, type CommandParams, type CommandValue, parseCommand } from "../../src/lib/teamspeak/wire/commandText.js";

export function startSession(clientId = 5, initServer: Record<string, string> = { virtualserver_name: "Test" }) {
  const session = new SessionState();
  session.start(initServer, clientId);
  const events: SessionEvent[] = [];
  const feed = (text: string) => {
    const command = parseCommand(text);
    const applied = session.apply({ name: command.name!, flags: command.flags, rows: command.rows, low: false });
    events.push(...applied);
    return applied;
  };
  return { session, events, feed };
}

/** `name` with one row per params object. */
export const cmd = (name: string, ...rows: CommandParams[]) => buildCommand(name, rows[0], { rows: rows.slice(1) });

export const enter = (clid: number, ctid: number, nickname: string, extra: Record<string, CommandValue> = {}) =>
  cmd("notifycliententerview", { cfid: 0, ctid, reasonid: 2, clid, client_nickname: nickname, client_type: 0, ...extra });

/** Lobby (1) with Talk (2) below it and AFK (3) after it, then the end of the list. */
export const WELCOME_CHANNELS = [
  cmd(
    "channellist",
    { cid: 1, cpid: 0, channel_order: 0, channel_name: "Lobby", channel_flag_default: 1 },
    { cid: 2, cpid: 1, channel_order: 0, channel_name: "Talk" },
    { cid: 3, cpid: 0, channel_order: 1, channel_name: "AFK" },
  ),
  "channellistfinished",
];
