import { EventEmitter } from "node:events";
import {
  identityFromString as sdkIdentityFromString,
  listChannels as tsListChannels,
  type Client as TS3FullClient,
  type RawNotification,
  type TextMessage,
  type VoiceData,
} from "@echosixhiya/teamspeak-client";
import { buildCommand, type CommandRequest } from "../../lib/teamspeak/index.js";
import type { Logger } from "../../shared/logger.js";
import { normalizeTeamSpeakKickedReason } from "../../shared/errors.js";
import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";
import { TeamSpeakAdapter } from "./teamSpeakAdapter.js";
import { loadClientAvatarOnConnection } from "./teamSpeakAvatar.js";
import { listClientsWithStatus } from "./teamSpeakClientList.js";
import type { TSChatMessage } from "./teamSpeakMessages.js";
import type { TeamSpeakBackend, TeamSpeakBackendEvents, TeamSpeakBackendOptions, TSClientAvatar } from "./teamSpeakBackend.js";

const requestText = (request: CommandRequest | string) =>
  typeof request === "string" ? request : buildCommand(request.name, request.params, request);

/** Keep the target id of private messages, dropping it made the bridge dereference undefined while echoing it. */
export function toTSChatMessage(msg: TextMessage): TSChatMessage {
  return {
    invokerName: msg.invokerName,
    invokerId: msg.invokerID,
    invokerUid: msg.invokerUID,
    message: msg.message,
    targetMode: msg.targetMode,
    targetId: msg.targetID,
  };
}

/** The old SDK under TSClient, with the workarounds it needs. Goes away with the SDK. */
export class SdkBackend extends EventEmitter<TeamSpeakBackendEvents> implements TeamSpeakBackend {
  private readonly adapter: TeamSpeakAdapter;
  private readonly client: TS3FullClient;
  // The SDK hands only the reason message to kicked and drops the id, which tells a server kick from a ban.
  private selfLeaveReasonId: number | null = null;

  constructor(
    private readonly options: TeamSpeakBackendOptions,
    logger: Logger,
  ) {
    super();
    this.adapter = new TeamSpeakAdapter(
      {
        target: options.transportTarget,
        nickname: options.nickname,
        identity: sdkIdentityFromString(options.identity.toString()),
        serverPassword: options.serverPassword,
        defaultChannel: options.defaultChannel,
        channelPassword: options.channelPassword,
      },
      logger,
    );
    this.client = this.adapter.client;
    this.attachListeners();
  }

  get protocol(): TeamSpeakProtocol | null {
    return this.adapter.protocol;
  }

  async connect(): Promise<void> {
    this.selfLeaveReasonId = null;
    await this.adapter.connect();
  }

  disconnect(): Promise<void> {
    return this.adapter.disconnect();
  }

  clientId(): number {
    // The SDK learns the id during the welcome, before connect() resumes.
    return this.client.clientID();
  }

  channelId(): bigint {
    return this.client.channelID();
  }

  command(request: CommandRequest | string, timeoutMs = 10_000): Promise<Record<string, string>[]> {
    return this.client.execCommandWithResponse(requestText(request), timeoutMs);
  }

  send(text: string): Promise<void> {
    return this.client.sendCommandNoWait(text);
  }

  sendVoice(data: Buffer, codec: number): void {
    this.client.sendVoice(data, codec);
  }

  sendWhisper(data: Buffer, clientIds: number[], codec: number): void {
    this.client.sendWhisper(data, clientIds, codec);
  }

  loadAvatar(clientId: number, expectedUid: string, pace: <T>(command: () => Promise<T>) => Promise<T>): Promise<TSClientAvatar | null> {
    return loadClientAvatarOnConnection(this.client, () => true, pace, this.options.serverHost, clientId, expectedUid);
  }

  async syncDirectory(pace: <T>(command: () => Promise<T>) => Promise<T>): Promise<void> {
    // The SDK pushes directory snapshots through two nested setImmediate calls, so let both flush first.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    // TS6 sometimes ended the welcome stream before it told us about everyone already there.
    const client = this.client;
    const channels = await pace(() => tsListChannels(client));
    const clients = await pace(() => listClientsWithStatus(client));
    this.emit("directorySnapshot", { channels, clients });
  }

  private attachListeners(): void {
    const client = this.client;
    client.on("voiceData", (data: VoiceData) => {
      this.emit("voiceData", { clientId: data.clientId, codec: data.codec, data: Buffer.from(data.data) });
    });
    client.on("directorySnapshot", (snapshot) => {
      this.emit("directorySnapshot", { channels: snapshot.channels.slice(), clients: snapshot.clients.slice() });
    });
    client.on("rawNotification", (notification: RawNotification) => {
      this.emit("rawNotification", { name: notification.name, params: { ...notification.params } });
    });
    client.on("textMessage", (msg) => this.emit("textMessage", toTSChatMessage(msg)));
    client.on("poked", (event) => this.emit("poked", event));
    client.on("disconnected", (err) => this.emit("disconnected", err));
    client.on("clientEnter", (info) => this.emit("clientEnter", info));
    client.on("clientLeave", (info) => {
      if (info.id === client.clientID() && (info.reasonID === 4 || info.reasonID === 5)) this.selfLeaveReasonId = info.reasonID;
      this.emit("clientLeave", info);
    });
    // The SDK emits kicked only for a self leave with reason 4 or 5 and passes just the admin's message.
    client.on("kicked", (reasonMsg) => {
      const reasonId = this.selfLeaveReasonId;
      this.selfLeaveReasonId = null;
      this.emit("kicked", normalizeTeamSpeakKickedReason(reasonMsg, reasonId));
    });
    client.on("clientMoved", (info) => this.emit("clientMoved", info));
    client.on("clientUpdated", (event) => this.emit("clientUpdated", event.info));
  }
}
