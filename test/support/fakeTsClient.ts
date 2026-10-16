import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import {
  generateIdentity,
  ServerError,
  type ChannelInfo,
  type ClientInfo,
  type DirectoryClientInfo,
  type Identity,
} from "@echosixhiya/teamspeak-client";
import { normalizeTeamSpeakKickedReason } from "../../src/shared/errors.js";
import type { TeamSpeakProtocol } from "../../src/shared/teamSpeakProtocol.js";
import type {
  TSChatMessage,
  TSChatScope,
  TSClient,
  TSClientAvatar,
  TSClientOptions,
  TSVoiceData,
} from "../../src/modules/teamspeak/teamSpeakClient.js";
import type { VoiceBridgeOptions } from "../../src/modules/voice/voiceBridge.js";
import {
  DEFAULT_FAKE_CHANNELS,
  FakeRemoteMember,
  type FakeChannel,
  type FakeOperation,
  type FakeServerOptions,
} from "./fakeTsClientScript.js";

export { DEFAULT_FAKE_CHANNELS, FakeRemoteMember, type FakeChannel, type FakeOperation, type FakeServerOptions };

/**
 * In-memory TS server and clients for voice bridge tests, with the real event order and the SDK's ServerError.
 * Models passwords, bans, kicks and guest permissions. Unchecked against a real server (layer 5): senders get no copy of their own text.
 */

export class FakeTeamSpeakServer {
  readonly channels = new Map<bigint, FakeChannel>();
  readonly members = new Map<number, DirectoryClientInfo>();
  readonly connected = new Map<number, FakeTSClient>();
  /** Every client the factory made, in order. */
  readonly created: FakeTSClient[] = [];
  readonly bannedUids = new Set<string>();
  readonly adminUids = new Set<string>();
  readonly avatars = new Map<string, TSClientAvatar>();
  serverPassword: string;
  guestsCanMove: boolean;
  protocol: TeamSpeakProtocol;
  latencyMs: number;
  withholdSnapshot: boolean;
  defaultChannelId: bigint;
  /** Answers `execCommandWithResponse`. */
  onCommand: (command: string, client: FakeTSClient) => Record<string, string>[] = () => [];
  /** Sees `sendProtocolCommand`, for scripting screen share replies. */
  onProtocolCommand: (command: string, client: FakeTSClient) => void = () => {};
  private nextClientId = 1;
  private readonly failures = new Map<FakeOperation, unknown[]>();
  private connectGate: Promise<void> | null = null;

  constructor(options: FakeServerOptions = {}) {
    for (const channel of options.channels ?? DEFAULT_FAKE_CHANNELS) this.channels.set(channel.id, { ...channel });
    this.serverPassword = options.serverPassword ?? "";
    this.guestsCanMove = options.guestsCanMove ?? false;
    this.protocol = options.protocol ?? "ts6";
    this.latencyMs = options.latencyMs ?? 0;
    this.withholdSnapshot = options.withholdSnapshot ?? false;
    this.defaultChannelId = options.defaultChannelId ?? this.channels.keys().next().value!;
  }

  readonly createClient: NonNullable<VoiceBridgeOptions["createClient"]> = (options) => {
    const client = new FakeTSClient(this, options);
    this.created.push(client);
    return client as unknown as TSClient;
  };

  /** Make the next `times` calls of `operation` throw `error`. */
  failNext(operation: FakeOperation, error: unknown, times = 1): void {
    const queue = this.failures.get(operation) ?? [];
    for (let i = 0; i < times; i++) queue.push(error);
    this.failures.set(operation, queue);
  }

  /** Keep every `connect()` pending until the returned function is called. */
  holdConnects(): () => void {
    let release!: () => void;
    this.connectGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      this.connectGate = null;
      release();
    };
  }

  /** A scripted member that is not backed by a bridge session. */
  addMember(nickname: string, channelId: bigint = this.defaultChannelId, uid = `remote-${nickname}`): FakeRemoteMember {
    const member = this.register({ id: this.nextClientId++, nickname, uid, serverGroups: [], channelID: channelId, type: 0 });
    this.broadcast("clientEnter", this.clientInfo(member));
    return new FakeRemoteMember(this, member);
  }

  snapshot(): { channels: ChannelInfo[]; clients: DirectoryClientInfo[] } {
    const lastByParent = new Map<bigint, bigint>();
    const channels = [...this.channels.values()].map((channel) => {
      const parentID = channel.parentId ?? 0n;
      const info: ChannelInfo = { name: channel.name, description: "", id: channel.id, parentID, order: lastByParent.get(parentID) ?? 0n };
      lastByParent.set(parentID, channel.id);
      return info;
    });
    return { channels, clients: [...this.members.values()].map((member) => ({ ...member })) };
  }

  canMove(uid: string): boolean {
    return this.guestsCanMove || this.adminUids.has(uid);
  }

  /** The server ends a client's session with a kick (4) or a ban (5). */
  kick(client: FakeTSClient, reason = "", ban = false): void {
    if (ban) this.bannedUids.add(client.uid);
    client.receiveKick(reason, ban);
  }

  /** The transport of a client dies without a kick. */
  drop(client: FakeTSClient, error?: Error): void {
    client.receiveDrop(error);
  }

  moveMember(id: number, channelId: bigint, invoker?: DirectoryClientInfo): void {
    const member = this.members.get(id);
    if (!member) throw new ServerError("512", "invalid clientID");
    member.channelID = channelId;
    this.broadcast("clientMoved", {
      id,
      targetChannelID: channelId,
      reasonID: invoker ? 1 : 0,
      invokerID: invoker?.id ?? id,
      invokerName: invoker?.nickname ?? member.nickname,
      invokerUID: invoker?.uid ?? member.uid,
    });
  }

  updateMember(id: number, update: Partial<DirectoryClientInfo>): void {
    const member = this.members.get(id);
    if (!member) return;
    Object.assign(member, update);
    // `TSClient` unwraps the SDK's `{ info }` event, so the payload is the member itself.
    this.broadcast("clientUpdated", { ...member });
  }

  removeMember(id: number, reasonID = 8, reasonMsg = ""): void {
    if (!this.members.delete(id)) return;
    this.connected.delete(id);
    this.broadcast("clientLeave", { id, reasonID, reasonMsg, targetID: 0 });
  }

  deliverText(from: DirectoryClientInfo, scope: TSChatScope, message: string, targetId = 0n): void {
    const targetMode = scope === "private" ? 1 : scope === "server" ? 3 : 2;
    if (scope === "private" && !this.members.has(Number(targetId))) throw new ServerError("512", "invalid clientID");
    // Channel notifications carry no target; the SDK reports it as 0.
    const payload: TSChatMessage = {
      invokerName: from.nickname,
      invokerId: from.id,
      invokerUid: from.uid,
      message,
      targetMode,
      targetId: scope === "channel" ? 0n : targetId,
    };
    for (const [id, client] of this.connected) {
      if (id === from.id) continue;
      const member = this.members.get(id)!;
      if (scope === "channel" && member.channelID !== from.channelID) continue;
      if (scope === "private" && id !== Number(targetId)) continue;
      client.emit("textMessage", payload);
    }
  }

  /** Voice reaches the sender's channel, or only `toIds` for a whisper. */
  deliverVoice(fromId: number, data: Buffer, codec: number, toIds?: number[]): void {
    const from = this.members.get(fromId);
    if (!from) return;
    for (const [id, client] of this.connected) {
      if (id === fromId) continue;
      if (toIds ? !toIds.includes(id) : this.members.get(id)!.channelID !== from.channelID) continue;
      client.emit("voiceData", { clientId: fromId, codec, data: Buffer.from(data) } satisfies TSVoiceData);
    }
  }

  /** @internal */
  register(member: DirectoryClientInfo): DirectoryClientInfo {
    const full = { away: false, awayMessage: "", inputMuted: false, outputMuted: false, channelCommander: false, ...member };
    this.members.set(full.id, full);
    return full;
  }

  /** @internal */
  allocateClientId(): number {
    return this.nextClientId++;
  }

  /** @internal */
  clientInfo(member: DirectoryClientInfo): ClientInfo {
    return {
      nickname: member.nickname,
      uid: member.uid,
      serverGroups: member.serverGroups,
      channelID: member.channelID,
      type: member.type,
      id: member.id,
    };
  }

  /** @internal Latency, the connect gate and injected failures, in that order. */
  async step(operation: FakeOperation): Promise<void> {
    if (this.latencyMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
    if (operation === "connect" && this.connectGate) await this.connectGate;
    const queue = this.failures.get(operation);
    if (queue?.length) throw queue.shift();
  }

  /** @internal */
  broadcast(event: string, payload: unknown, except?: number): void {
    for (const [id, client] of this.connected) if (id !== except) client.emit(event, payload);
  }
}

/** Public surface of `TSClient`, backed by a `FakeTeamSpeakServer`. */
export class FakeTSClient extends EventEmitter {
  readonly sentVoice: { data: Buffer; codec: number }[] = [];
  readonly sentWhispers: { data: Buffer; clientIds: number[]; codec: number }[] = [];
  readonly sentMessages: { scope: TSChatScope; message: string; targetId: bigint }[] = [];
  readonly pokes: { clientId: number; message: string }[] = [];
  readonly commands: string[] = [];
  readonly protocolCommands: string[] = [];
  readonly identity: Identity;
  readonly uid: string;
  private clientId = 0;
  private isUp = false;
  private preferredChannelId = 0n;

  constructor(
    readonly server: FakeTeamSpeakServer,
    readonly options: TSClientOptions,
  ) {
    super();
    this.identity = options.identity ?? generateIdentity(8);
    this.uid = createHash("sha1").update(this.identity.publicKeyBase64()).digest("base64");
  }

  async connect(): Promise<void> {
    const { server, options } = this;
    await server.step("connect");
    if (server.bannedUids.has(this.uid)) throw new ServerError("3329", "you are banned");
    if (server.serverPassword && options.serverPassword !== server.serverPassword) throw new ServerError("520", "invalid password");
    const channel = this.joinChannel();
    this.clientId = server.allocateClientId();
    const member = server.register({
      id: this.clientId,
      nickname: options.nickname,
      uid: this.uid,
      serverGroups: [],
      channelID: channel.id,
      type: 0,
    });
    server.connected.set(this.clientId, this);
    server.broadcast("clientEnter", server.clientInfo(member), this.clientId);
    // The welcome sequence: the SDK announces the client itself first, then the directory.
    this.emit("clientEnter", server.clientInfo(member));
    if (!server.withholdSnapshot) this.emit("directorySnapshot", server.snapshot());
    this.preferredChannelId = channel.id;
    this.isUp = true;
    this.emit("connected", this.clientId);
  }

  private joinChannel(): FakeChannel {
    const { server, options } = this;
    const remembered = server.channels.get(this.preferredChannelId);
    // A reconnect returns to the previous channel when it still exists and is open.
    if (remembered && !remembered.password) return remembered;
    const wanted = [...server.channels.values()].find((channel) => channel.name === options.defaultChannel);
    const channel = wanted ?? server.channels.get(server.defaultChannelId)!;
    if (channel.password && channel.password !== options.channelPassword) throw new ServerError("781", "invalid password for channel");
    return channel;
  }

  sendVoice(data: Buffer, codec = 4): void {
    if (!this.isUp) return;
    this.sentVoice.push({ data: Buffer.from(data), codec });
    this.server.deliverVoice(this.clientId, data, codec);
  }

  sendWhisper(data: Buffer, clientIds: number[], codec = 4): void {
    if (!this.isUp) return;
    const targets = [...new Set(clientIds)].filter((id) => Number.isInteger(id) && id > 0 && id <= 65535 && id !== this.clientId);
    if (!targets.length) throw new Error("Whisper requires at least one valid target");
    this.sentWhispers.push({ data: Buffer.from(data), clientIds: targets, codec });
    this.server.deliverVoice(this.clientId, data, codec, targets);
  }

  async sendTextMessage(scope: TSChatScope, message: string, targetId = 0n): Promise<void> {
    this.ready();
    await this.server.step("sendTextMessage");
    this.sentMessages.push({ scope, message, targetId });
    this.server.deliverText(this.self(), scope, message, targetId);
  }

  async poke(clientId: number, message: string): Promise<void> {
    this.ready();
    await this.server.step("poke");
    if (!this.server.members.has(clientId)) throw new ServerError("512", "invalid clientID");
    this.pokes.push({ clientId, message });
    const self = this.self();
    this.server.connected.get(clientId)?.emit("poked", { invokerName: self.nickname, invokerUID: self.uid, invokerID: self.id, message });
  }

  async setAway(away: boolean, message = ""): Promise<void> {
    this.ready();
    await this.server.step("setAway");
    this.server.updateMember(this.clientId, { away, awayMessage: message });
  }

  async setInputMuted(muted: boolean): Promise<void> {
    this.ready();
    await this.server.step("setInputMuted");
    this.server.updateMember(this.clientId, { inputMuted: muted });
  }

  async setOutputMuted(muted: boolean): Promise<void> {
    this.ready();
    await this.server.step("setOutputMuted");
    this.server.updateMember(this.clientId, { outputMuted: muted });
  }

  async switchChannel(channelId: bigint, password?: string): Promise<void> {
    if (!this.isUp) return;
    await this.server.step("switchChannel");
    const channel = this.server.channels.get(channelId);
    if (!channel) throw new ServerError("768", "invalid channelID");
    if (this.self().channelID === channelId) throw new ServerError("770", "already member of channel");
    if (channel.password && channel.password !== password) throw new ServerError("781", "invalid password for channel");
    this.server.moveMember(this.clientId, channelId);
    this.preferredChannelId = channelId;
  }

  /** Moving another client needs the move permission and never asks for the channel password. */
  async moveClient(clientId: number, channelId: bigint, _password?: string): Promise<void> {
    this.ready();
    if (!Number.isInteger(clientId) || clientId <= 0 || clientId > 65535) throw new Error("Invalid TeamSpeak client id");
    await this.server.step("moveClient");
    if (!this.server.canMove(this.uid)) throw new ServerError("2568", "insufficient client permissions");
    if (!this.server.members.has(clientId)) throw new ServerError("512", "invalid clientID");
    if (!this.server.channels.has(channelId)) throw new ServerError("768", "invalid channelID");
    this.server.moveMember(clientId, channelId, this.self());
    const moved = this.server.connected.get(clientId);
    if (moved) moved.preferredChannelId = channelId;
  }

  getClientId(): number {
    return this.clientId;
  }
  getProtocol(): TeamSpeakProtocol | null {
    return this.isUp ? this.server.protocol : null;
  }
  getIdentityString(): string {
    return this.identity.toString();
  }
  getChannelId(): bigint {
    return this.server.members.get(this.clientId)?.channelID ?? 0n;
  }
  isConnected(): boolean {
    return this.isUp;
  }

  async execCommandWithResponse(command: string, _timeoutMs = 3000): Promise<Record<string, string>[]> {
    this.ready();
    await this.server.step("execCommand");
    this.commands.push(command);
    return this.server.onCommand(command, this);
  }

  async sendProtocolCommand(command: string): Promise<void> {
    this.ready();
    this.protocolCommands.push(command);
    this.server.onProtocolCommand(command, this);
  }

  async getClientAvatar(clientId: number, expectedUid = ""): Promise<TSClientAvatar | null> {
    this.ready();
    await this.server.step("avatar");
    const member = this.server.members.get(clientId);
    if (!member || (expectedUid && member.uid !== expectedUid)) return null;
    return this.server.avatars.get(member.uid) ?? null;
  }

  async disconnect(): Promise<void> {
    if (this.clientId) this.server.removeMember(this.clientId);
    this.isUp = false;
    this.clientId = 0;
  }

  /** @internal Called by `FakeTeamSpeakServer.kick`. */
  receiveKick(reason: string, ban: boolean): void {
    const id = this.clientId;
    this.emit("clientLeave", { id, reasonID: ban ? 5 : 4, reasonMsg: reason, targetID: 0 });
    this.emit("kicked", normalizeTeamSpeakKickedReason(reason, ban ? 5 : 4));
    this.receiveDrop();
  }

  /** @internal Called by `FakeTeamSpeakServer.drop`. */
  receiveDrop(error?: Error): void {
    if (this.clientId) this.server.removeMember(this.clientId, 3);
    this.isUp = false;
    this.clientId = 0;
    this.emit("disconnected", error);
  }

  private self(): DirectoryClientInfo {
    return this.server.members.get(this.clientId)!;
  }

  private ready(): void {
    if (!this.isUp) throw new Error("TeamSpeak session is not ready");
  }
}
