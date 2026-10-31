import type { CommandRow } from "../wire/commandRows.js";
import { parseI32, parseU16, parseU32, parseU64, parseU8 } from "../wire/commandValues.js";
import { type FieldSpec, flag, groupIds, type Properties, readFields, text } from "./propertyFields.js";

export interface ClientFields {
  nickname: string;
  uid: string;
  databaseId: bigint;
  /** 0 for a voice client, 1 for a query client. */
  type: number;
  serverGroups: readonly number[];
  channelGroupId: number;
  away: boolean;
  awayMessage: string;
  inputMuted: boolean;
  outputMuted: boolean;
  inputHardware: boolean;
  outputHardware: boolean;
  channelCommander: boolean;
  prioritySpeaker: boolean;
  recording: boolean;
  talkPower: number;
  /** Granted the right to talk in a moderated channel. The server clears it on a channel change. */
  talker: boolean;
  description: string;
  avatar: string;
}

export interface SessionClient extends Readonly<ClientFields> {
  readonly id: number;
  readonly channelId: bigint;
  /** Every property the server sent for this client. */
  readonly properties: Properties;
}

const CLIENT_FIELDS: FieldSpec<ClientFields> = {
  nickname: ["client_nickname", text, ""],
  uid: ["client_unique_identifier", text, ""],
  databaseId: ["client_database_id", parseU64, 0n],
  type: ["client_type", parseU8, 0],
  serverGroups: ["client_servergroups", groupIds, []],
  channelGroupId: ["client_channel_group_id", parseU32, 0],
  away: ["client_away", flag, false],
  awayMessage: ["client_away_message", text, ""],
  inputMuted: ["client_input_muted", flag, false],
  outputMuted: ["client_output_muted", flag, false],
  inputHardware: ["client_input_hardware", flag, true],
  outputHardware: ["client_output_hardware", flag, true],
  channelCommander: ["client_is_channel_commander", flag, false],
  prioritySpeaker: ["client_is_priority_speaker", flag, false],
  recording: ["client_is_recording", flag, false],
  talkPower: ["client_talk_power", parseI32, 0],
  talker: ["client_is_talker", flag, false],
  description: ["client_description", text, ""],
  avatar: ["client_flag_avatar", text, ""],
};

// Keys of the notification itself, not of the client.
const EVENT_KEYS = new Set(["cfid", "ctid", "reasonid", "reasonmsg", "invokerid", "invokername", "invokeruid", "bantime", "return_code"]);

export const clientIdOf = (row: CommandRow) => {
  const id = parseU16(row.clid);
  return id === undefined || id === 0 ? undefined : id;
};

/** The clients in view, keyed by client id. */
export class ClientRegistry {
  readonly #clients = new Map<number, SessionClient>();

  get(id: number): SessionClient | undefined {
    return this.#clients.get(id);
  }

  values(): IterableIterator<SessionClient> {
    return this.#clients.values();
  }

  /** A client that came into view, on top of what we knew if it never left. */
  enter(row: CommandRow, channelId: bigint): SessionClient | undefined {
    const id = clientIdOf(row);
    if (id === undefined) return undefined;
    return this.#store(id, channelId, row, this.#clients.get(id)).client;
  }

  update(row: CommandRow): { client: SessionClient; changed: (keyof ClientFields)[] } | undefined {
    const id = clientIdOf(row);
    const previous = id === undefined ? undefined : this.#clients.get(id);
    if (!previous) return undefined;
    return this.#store(previous.id, previous.channelId, row, previous);
  }

  move(id: number, channelId: bigint): SessionClient | undefined {
    const previous = this.#clients.get(id);
    if (!previous) return undefined;
    const client = { ...previous, channelId };
    this.#clients.set(id, client);
    return client;
  }

  remove(id: number): SessionClient | undefined {
    const client = this.#clients.get(id);
    this.#clients.delete(id);
    return client;
  }

  /** Removes the clients in these channels, except `keep`. */
  removeIn(channelIds: ReadonlySet<bigint>, keep: number): SessionClient[] {
    const removed = [...this.#clients.values()].filter((client) => client.id !== keep && channelIds.has(client.channelId));
    for (const client of removed) this.#clients.delete(client.id);
    return removed;
  }

  #store(id: number, channelId: bigint, row: CommandRow, previous: SessionClient | undefined) {
    const { fields, properties, changed } = readFields(CLIENT_FIELDS, row, previous, EVENT_KEYS);
    const client: SessionClient = { id, channelId, ...fields, properties };
    this.#clients.set(id, client);
    return { client, changed };
  }
}
