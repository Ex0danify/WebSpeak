import { hashPassword } from "../handshake/clientInit.js";
import type { CommandValue } from "../wire/commandText.js";
import type { CommandRequest } from "./commandTracker.js";

export const TextMessageTarget = { client: 1, channel: 2, server: 3 } as const;
export type TextMessageTargetMode = (typeof TextMessageTarget)[keyof typeof TextMessageTarget];

/** `clientdisconnect` and the server's leave notification use 8 for leaving on purpose. */
const REASON_LEAVING = 8;

function clientId(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 0xffff) throw new TypeError(`Invalid TeamSpeak client id: ${value}`);
  return value;
}

function channelId(value: bigint): bigint {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new TypeError(`Invalid TeamSpeak channel id: ${value}`);
  return value;
}

export interface ClientMoveOptions {
  clientId: number;
  channelId: bigint;
  /** Plain text, it goes out hashed like in `clientinit`. */
  password?: string;
}

export function clientMove(options: ClientMoveOptions): CommandRequest {
  return {
    name: "clientmove",
    params: [
      ["clid", clientId(options.clientId)],
      ["cid", channelId(options.channelId)],
      ["cpw", options.password ? hashPassword(options.password) : undefined],
    ],
  };
}

export function clientPoke(target: number, message: string): CommandRequest {
  return {
    name: "clientpoke",
    params: [
      ["clid", clientId(target)],
      ["msg", message],
    ],
  };
}

/** The target is a client id for private messages, ignored by the server otherwise. */
export function sendTextMessage(mode: TextMessageTargetMode, target: number | bigint, message: string): CommandRequest {
  return {
    name: "sendtextmessage",
    params: [
      ["targetmode", mode],
      ["target", target],
      ["msg", message],
    ],
  };
}

export interface ClientUpdateProperties {
  nickname?: string;
  inputMuted?: boolean;
  outputMuted?: boolean;
  away?: boolean;
  awayMessage?: string;
}

const CLIENT_UPDATE_KEYS: Readonly<Record<keyof ClientUpdateProperties, string>> = {
  nickname: "client_nickname",
  inputMuted: "client_input_muted",
  outputMuted: "client_output_muted",
  away: "client_away",
  awayMessage: "client_away_message",
};

export function clientUpdate(properties: ClientUpdateProperties): CommandRequest {
  const params: [string, CommandValue][] = [];
  for (const [field, key] of Object.entries(CLIENT_UPDATE_KEYS) as [keyof ClientUpdateProperties, string][]) {
    if (properties[field] !== undefined) params.push([key, properties[field]]);
  }
  if (params.length === 0) throw new TypeError("clientupdate needs at least one property");
  return { name: "clientupdate", params };
}

export function channelSubscribeAll(): CommandRequest {
  return { name: "channelsubscribeall" };
}

/** Needs `b_virtualserver_client_list`, which guests lack on a default server. */
export function clientList(flags: readonly string[] = ["uid", "away", "voice", "groups"]): CommandRequest {
  return { name: "clientlist", flags };
}

export function clientInfo(target: number): CommandRequest {
  return { name: "clientinfo", params: { clid: clientId(target) } };
}

/** Needs `b_virtualserver_channel_list`. The answer has fewer fields than the welcome's channellist. */
export function channelList(): CommandRequest {
  return { name: "channellist" };
}

export function version(): CommandRequest {
  return { name: "version" };
}

export function clientDisconnect(reasonMessage = "leaving"): CommandRequest {
  return {
    name: "clientdisconnect",
    params: [
      ["reasonid", REASON_LEAVING],
      ["reasonmsg", reasonMessage],
    ],
  };
}
