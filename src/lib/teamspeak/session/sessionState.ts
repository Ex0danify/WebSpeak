import type { ServerCommand } from "../command/commandTracker.js";
import type { CommandRow } from "../wire/commandRows.js";
import { ChannelTree, type SessionChannel } from "./channelTree.js";
import { ClientRegistry, type SessionClient } from "./clientRegistry.js";
import { directoryChannel, directoryClient, type DirectorySnapshot } from "./directorySnapshot.js";
import { applyNotification, type SessionParts } from "./notificationApply.js";
import { readServer, type SessionGroup, type SessionServer } from "./serverInfo.js";
import type { SessionEvent } from "./sessionEvents.js";

export interface SessionSelf {
  /** From `initserver aclid`, 0 before it. */
  clientId: number;
  /** 0 until our own enter view arrived. */
  channelId: bigint;
  client: SessionClient | undefined;
  /** Whether our voice is let through in this channel. True while we do not know better, the server decides in the end. */
  canTalk: boolean;
}

/** What the server told us so far, read only. */
export interface SessionView {
  readonly welcomeComplete: boolean;
  readonly self: SessionSelf;
  readonly server: SessionServer;
  readonly serverGroups: ReadonlyMap<number, SessionGroup>;
  readonly channelGroups: ReadonlyMap<number, SessionGroup>;
  channel(id: bigint): SessionChannel | undefined;
  channels(): SessionChannel[];
  /** Siblings in display order. */
  children(parentId: bigint): SessionChannel[];
  client(id: number): SessionClient | undefined;
  clients(): SessionClient[];
  /** Plain copies in the shape the gateway uses. */
  snapshot(): DirectorySnapshot;
}

/**
 * Server, channels, clients and groups, kept up to date from the server's commands. The welcome
 * is complete with `initserver`, `channellistfinished` and our own enter view; TS3 sends the
 * enter view before `channellistfinished`, so the order does not matter.
 */
export class SessionState implements SessionView {
  readonly #parts: SessionParts = {
    selfId: 0,
    channels: new ChannelTree(),
    clients: new ClientRegistry(),
    server: readServer({}, undefined).server,
    serverGroups: new Map(),
    channelGroups: new Map(),
  };
  #started = false;
  #channelListFinished = false;
  #selfEntered = false;
  #welcomeComplete = false;

  get welcomeComplete(): boolean {
    return this.#welcomeComplete;
  }

  get self(): SessionSelf {
    const client = this.#parts.clients.get(this.#parts.selfId);
    const channel = client && this.#parts.channels.get(client.channelId);
    const canTalk = !client || !channel || client.talker || client.talkPower >= channel.neededTalkPower;
    return { clientId: this.#parts.selfId, channelId: client?.channelId ?? 0n, client, canTalk };
  }

  get server(): SessionServer {
    return this.#parts.server;
  }

  get serverGroups(): ReadonlyMap<number, SessionGroup> {
    return this.#parts.serverGroups;
  }

  get channelGroups(): ReadonlyMap<number, SessionGroup> {
    return this.#parts.channelGroups;
  }

  channel(id: bigint): SessionChannel | undefined {
    return this.#parts.channels.get(id);
  }

  channels(): SessionChannel[] {
    return [...this.#parts.channels.values()];
  }

  children(parentId: bigint): SessionChannel[] {
    return this.#parts.channels.children(parentId);
  }

  client(id: number): SessionClient | undefined {
    return this.#parts.clients.get(id);
  }

  clients(): SessionClient[] {
    return [...this.#parts.clients.values()];
  }

  snapshot(): DirectorySnapshot {
    return { channels: this.channels().map(directoryChannel), clients: this.clients().map(directoryClient) };
  }

  /** The `initserver` row and our id from its `aclid`. */
  start(initServer: CommandRow, clientId: number): void {
    if (this.#started) throw new Error("TeamSpeak session already started");
    this.#started = true;
    this.#parts.selfId = clientId;
    this.#parts.server = readServer(initServer, undefined).server;
  }

  /** A command from the server that is not an answer. Returns the events to emit, in order. */
  apply(command: ServerCommand): SessionEvent[] {
    if (command.name === "channellist") {
      for (const row of command.rows) this.#parts.channels.add(row);
      return [];
    }
    if (command.name === "channellistfinished") {
      this.#channelListFinished = true;
      return this.#checkWelcome();
    }
    const events = applyNotification(this.#parts, command) ?? [{ type: "notification", command }];
    if (events.some((event) => event.type === "clientEnter" && event.client.id === this.#parts.selfId)) this.#selfEntered = true;
    return [...events, ...this.#checkWelcome()];
  }

  #checkWelcome(): SessionEvent[] {
    if (this.#welcomeComplete || !this.#started || !this.#channelListFinished || !this.#selfEntered) return [];
    this.#welcomeComplete = true;
    return [{ type: "welcomeComplete" }];
  }
}
