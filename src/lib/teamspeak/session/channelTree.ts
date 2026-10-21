import type { CommandRow } from "../wire/commandRows.js";
import { parseI32, parseU64, parseU8 } from "../wire/commandValues.js";
import { type FieldSpec, flag, type Properties, readFields, text } from "./propertyFields.js";

export interface ChannelFields {
  /** 0 for a top level channel. */
  parentId: bigint;
  /** The sibling this channel sits below, 0 for the first one. */
  order: bigint;
  name: string;
  topic: string;
  codec: number;
  codecQuality: number;
  codecUnencrypted: boolean;
  hasPassword: boolean;
  isDefault: boolean;
  /** -1 for no limit. */
  maxClients: number;
  neededTalkPower: number;
}

export interface SessionChannel extends Readonly<ChannelFields> {
  readonly id: bigint;
  /** From `notifychannelsubscribed` and `notifychannelunsubscribed` only. */
  readonly subscribed: boolean;
  /** Every property the server sent for this channel. */
  readonly properties: Properties;
}

const CHANNEL_FIELDS: FieldSpec<ChannelFields> = {
  parentId: ["cpid", parseU64, 0n],
  order: ["channel_order", parseU64, 0n],
  name: ["channel_name", text, ""],
  topic: ["channel_topic", text, ""],
  codec: ["channel_codec", parseU8, 4],
  codecQuality: ["channel_codec_quality", parseU8, 6],
  codecUnencrypted: ["channel_codec_is_unencrypted", flag, true],
  hasPassword: ["channel_flag_password", flag, false],
  isDefault: ["channel_flag_default", flag, false],
  maxClients: ["channel_maxclients", parseI32, -1],
  neededTalkPower: ["channel_needed_talk_power", parseI32, 0],
};

// Keys of the notification itself, not of the channel.
const EVENT_KEYS = new Set(["reasonid", "invokerid", "invokername", "invokeruid", "return_code"]);

// Answers to `channellist` and `notifychannelmoved` say `pid` and `order`, the welcome and the other
// notifications `cpid` and `channel_order`.
function normalized(row: CommandRow): CommandRow {
  if (row.pid === undefined && row.order === undefined) return row;
  const copy: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, row);
  if (copy.cpid === undefined && copy.pid !== undefined) copy.cpid = copy.pid;
  if (copy.channel_order === undefined && copy.order !== undefined) copy.channel_order = copy.order;
  return copy;
}

/**
 * Channels with their order as a linked list per parent: `order` names the sibling above. The
 * server announces only the channel that changed, so the sibling below it is relinked here.
 */
export class ChannelTree {
  readonly #channels = new Map<bigint, SessionChannel>();

  get size(): number {
    return this.#channels.size;
  }

  get(id: bigint): SessionChannel | undefined {
    return this.#channels.get(id);
  }

  values(): IterableIterator<SessionChannel> {
    return this.#channels.values();
  }

  /** Siblings in display order. Ones the chain does not reach follow by id, so none get lost. */
  children(parentId: bigint): SessionChannel[] {
    const siblings = [...this.#channels.values()].filter((channel) => channel.parentId === parentId);
    const below = new Map(siblings.map((channel) => [channel.order, channel]));
    const ordered: SessionChannel[] = [];
    const seen = new Set<bigint>();
    for (let next = below.get(0n); next && !seen.has(next.id); next = below.get(next.id)) {
      seen.add(next.id);
      ordered.push(next);
    }
    const rest = siblings.filter((channel) => !seen.has(channel.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
    return [...ordered, ...rest];
  }

  /** A channel of the welcome list, whose order is already consistent with the others. */
  add(row: CommandRow): SessionChannel | undefined {
    const id = parseU64(row.cid);
    if (id === undefined || id === 0n) return undefined;
    return this.#store(id, normalized(row), this.#channels.get(id)).channel;
  }

  /** A channel created after the welcome. */
  create(row: CommandRow): SessionChannel | undefined {
    const id = parseU64(row.cid);
    if (id === undefined || id === 0n) return undefined;
    const previous = this.#channels.get(id);
    if (previous) this.#unlink(previous);
    const { channel } = this.#store(id, normalized(row), previous);
    this.#link(channel);
    return channel;
  }

  /** Changed properties of a known channel, a new parent or order included. */
  edit(row: CommandRow): { channel: SessionChannel; previous: SessionChannel; changed: (keyof ChannelFields)[] } | undefined {
    const previous = this.#channels.get(parseU64(row.cid) ?? 0n);
    if (!previous) return undefined;
    this.#unlink(previous);
    const { channel, changed } = this.#store(previous.id, normalized(row), previous);
    this.#link(channel);
    return { channel, previous, changed };
  }

  /** The channel and everything below it, children first. */
  delete(id: bigint): SessionChannel[] {
    const channel = this.#channels.get(id);
    if (!channel) return [];
    const removed: SessionChannel[] = [];
    const collect = (parent: SessionChannel) => {
      for (const child of [...this.#channels.values()].filter((candidate) => candidate.parentId === parent.id)) collect(child);
      removed.push(parent);
    };
    collect(channel);
    this.#unlink(channel);
    for (const gone of removed) this.#channels.delete(gone.id);
    return removed;
  }

  setSubscribed(id: bigint, subscribed: boolean): SessionChannel | undefined {
    const channel = this.#channels.get(id);
    if (!channel || channel.subscribed === subscribed) return undefined;
    const next = { ...channel, subscribed };
    this.#channels.set(id, next);
    return next;
  }

  #store(id: bigint, row: CommandRow, previous: SessionChannel | undefined) {
    const { fields, properties, changed } = readFields(CHANNEL_FIELDS, row, previous, EVENT_KEYS);
    const channel: SessionChannel = { id, ...fields, subscribed: previous?.subscribed ?? false, properties };
    this.#channels.set(id, channel);
    return { channel, changed };
  }

  #setOrder(channel: SessionChannel, order: bigint): void {
    this.#channels.set(channel.id, { ...channel, order });
  }

  #siblingBelow(parentId: bigint, order: bigint, except: bigint): SessionChannel | undefined {
    for (const channel of this.#channels.values())
      if (channel.id !== except && channel.parentId === parentId && channel.order === order) return channel;
    return undefined;
  }

  // The sibling that sat right below the channel moves up into its place.
  #unlink(channel: SessionChannel): void {
    const below = this.#siblingBelow(channel.parentId, channel.id, channel.id);
    if (below) this.#setOrder(below, channel.order);
  }

  // The sibling that sat in the new place now sits below the channel.
  #link(channel: SessionChannel): void {
    const displaced = this.#siblingBelow(channel.parentId, channel.order, channel.id);
    if (displaced) this.#setOrder(displaced, channel.id);
  }
}
