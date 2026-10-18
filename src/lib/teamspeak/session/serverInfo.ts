import type { CommandRow } from "../wire/commandRows.js";
import { parseI32, parseU32, parseU8 } from "../wire/commandValues.js";
import { type FieldSpec, type Properties, readFields, text } from "./propertyFields.js";

export interface ServerFields {
  name: string;
  welcomeMessage: string;
  platform: string;
  version: string;
  maxClients: number;
  /** 0 per channel, 1 forced off, 2 forced on. */
  codecEncryptionMode: number;
  hostMessage: string;
  hostMessageMode: number;
  hostBannerUrl: string;
  hostBannerGfxUrl: string;
  defaultServerGroupId: number;
  defaultChannelGroupId: number;
}

export interface SessionServer extends Readonly<ServerFields> {
  /** Every property of `initserver` and the server notifications since. */
  readonly properties: Properties;
}

export interface SessionGroup {
  readonly id: number;
  readonly name: string;
  /** 0 template, 1 regular, 2 query. */
  readonly type: number;
  readonly iconId: number;
  readonly sortId: number;
  readonly properties: Properties;
}

const SERVER_FIELDS: FieldSpec<ServerFields> = {
  name: ["virtualserver_name", text, ""],
  welcomeMessage: ["virtualserver_welcomemessage", text, ""],
  platform: ["virtualserver_platform", text, ""],
  version: ["virtualserver_version", text, ""],
  maxClients: ["virtualserver_maxclients", parseU32, 0],
  codecEncryptionMode: ["virtualserver_codec_encryption_mode", parseU8, 0],
  hostMessage: ["virtualserver_hostmessage", text, ""],
  hostMessageMode: ["virtualserver_hostmessage_mode", parseU8, 0],
  hostBannerUrl: ["virtualserver_hostbanner_url", text, ""],
  hostBannerGfxUrl: ["virtualserver_hostbanner_gfx_url", text, ""],
  defaultServerGroupId: ["virtualserver_default_server_group", parseU32, 0],
  defaultChannelGroupId: ["virtualserver_default_channel_group", parseU32, 0],
};

const EVENT_KEYS = new Set(["reasonid", "invokerid", "invokername", "invokeruid", "return_code"]);

export function readServer(row: CommandRow, previous: SessionServer | undefined) {
  const { fields, properties, changed } = readFields(SERVER_FIELDS, row, previous, EVENT_KEYS);
  return { server: { ...fields, properties } satisfies SessionServer, changed };
}

/** A group list replaces the one before, the server always sends it whole. */
export function readGroups(rows: readonly CommandRow[], idKey: "sgid" | "cgid"): Map<number, SessionGroup> {
  const groups = new Map<number, SessionGroup>();
  for (const row of rows) {
    const id = parseU32(row[idKey]);
    if (id === undefined) continue;
    groups.set(id, {
      id,
      name: row.name ?? "",
      type: parseU8(row.type) ?? 1,
      // Icon ids are CRC32 values, some servers send them signed.
      iconId: parseU32(row.iconid) ?? (parseI32(row.iconid) ?? 0) >>> 0,
      sortId: parseU32(row.sortid) ?? 0,
      properties: Object.assign(Object.create(null) as Record<string, string>, row),
    });
  }
  return groups;
}
