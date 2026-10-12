import { EventEmitter } from "node:events";
import {
  Client as TS3FullClient,
  clientMove as tsClientMove,
  listChannels as tsListChannels,
  listClients as tsListClients,
  poke as tsPoke,
  sendTextMessage as tsSendTextMessage,
  generateIdentity,
  type Identity,
  type VoiceData,
  type DirectoryClientInfo,
  type DirectorySnapshot,
  type RawNotification,
  type TextMessage,
} from "@echosixhiya/teamspeak-client";
import type { Logger } from "../../shared/logger.js";
import { describeTeamSpeakError, normalizeTeamSpeakError, normalizeTeamSpeakKickedReason } from "../../shared/errors.js";
import { TeamSpeakAdapter } from "./teamSpeakAdapter.js";
import { createCommandPacer } from "./commandPacer.js";
import { loadClientAvatar, type TeamSpeakAvatarClient, type TSClientAvatar } from "./teamSpeakAvatar.js";
import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import { createAccelerationRelayClient, type AccelerationRelayClient, type AccelerationRelayOptions } from "../relay/index.js";

export interface TSClientOptions {
  target: TeamSpeakTarget;
  nickname: string;
  serverPassword?: string;
  defaultChannel?: string;
  channelPassword?: string;
  identity?: Identity;
  acceleration?: AccelerationRelayOptions;
}

export interface TSVoiceData {
  clientId: number;
  codec: number; // 4 = voice, 5 = music
  data: Buffer;
}

export type { TSClientAvatar };
export type TSDirectorySnapshot = DirectorySnapshot;
export type TSDirectoryClient = DirectoryClientInfo;
export type TSRawNotification = RawNotification;

export type TSChatScope = "channel" | "server" | "private";

export interface TSChatMessage {
  invokerName: string;
  invokerId: number;
  invokerUid: string;
  message: string;
  targetMode: number;
  targetId: bigint;
}

/**
 * Keep the target id of private messages, dropping it made the bridge dereference
 * undefined while echoing the message to the browser.
 */
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

export class TSClient extends EventEmitter {
  private client: TS3FullClient | null = null;
  private adapter: TeamSpeakAdapter | null = null;
  private logger: Logger;
  private readonly identity: Identity;
  private clientId = 0;
  private connected = false;
  private readonly pacer = createCommandPacer();
  private preferredChannelId = 0n;
  private accelerationClient: AccelerationRelayClient | null = null;
  // Reason id of the last self leave. The SDK hands only the reason message to kicked and drops
  // the id, so this is how we tell a kick (4) from a ban (5).
  private selfLeaveReasonId: number | null = null;

  constructor(
    private options: TSClientOptions,
    logger: Logger,
  ) {
    super();
    this.logger = logger.child({ nickname: options.nickname });
    this.identity = options.identity ?? generateIdentity(8);
  }

  async connect(): Promise<void> {
    this.selfLeaveReasonId = null;
    if (!this.adapter || !this.client) {
      let transportTarget = this.options.target;
      if (this.options.acceleration && !this.accelerationClient) {
        this.accelerationClient = await createAccelerationRelayClient({
          ...this.options.acceleration,
          host: this.options.target.host,
          port: this.options.target.port,
        });
        transportTarget = { host: this.accelerationClient.localHost, port: this.accelerationClient.localPort };
      }
      this.adapter = new TeamSpeakAdapter(
        {
          target: transportTarget,
          nickname: this.options.nickname,
          identity: this.identity,
          serverPassword: this.options.serverPassword,
          defaultChannel: this.options.defaultChannel,
          channelPassword: this.options.channelPassword,
        },
        this.logger,
      );
      this.client = this.adapter.client;
      this.attachClientListeners(this.client);
    }
    const adapter = this.adapter;
    const client = this.client;

    await adapter.connect();

    this.clientId = client.clientID();
    try {
      // Native clients subscribe to the whole channel tree after welcome. Without it members
      // vanish from the list as soon as they leave our channel.
      await this.pacer.run(() => client.execCommand("channelsubscribeall", 5000));
    } catch (error: unknown) {
      this.logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        "Could not subscribe to all TeamSpeak channels",
      );
    }
    // The SDK pushes directory snapshots through two nested setImmediate calls for no good reason,
    // so let both flush before reconciling.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    // TS6 sometimes ends the welcome stream before it told us about everyone already there, so pull
    // one snapshot over this session to make earlier joiners show up.
    try {
      const channels = await this.pacer.run(() => tsListChannels(client));
      const clients = await this.pacer.run(() => tsListClients(client));
      this.emit("directorySnapshot", { channels, clients });
    } catch (error: unknown) {
      this.logger.warn(
        {
          failureCode: "DIRECTORY_SNAPSHOT_UNAVAILABLE",
          failureDetail: error instanceof Error ? error.message : String(error),
        },
        "TeamSpeak directory snapshot unavailable",
      );
    }

    const connectedChannelId = client.channelID();
    if (this.preferredChannelId === 0n) {
      this.preferredChannelId = connectedChannelId;
    } else if (connectedChannelId !== this.preferredChannelId) {
      try {
        await tsClientMove(client, this.clientId, this.preferredChannelId);
      } catch (error: unknown) {
        // The old channel may be gone or off limits, the SDK already put us in the default channel.
        this.logger.info(
          {
            channelId: this.preferredChannelId.toString(),
            err: error instanceof Error ? error.message : String(error),
          },
          "Previous TeamSpeak channel could not be restored",
        );
        this.preferredChannelId = client.channelID();
      }
    }
    this.connected = true;

    this.logger.info({ clientId: this.clientId }, "Connected to TeamSpeak");
    this.emit("connected", this.clientId);
  }

  async getClientAvatar(clientId: number, expectedUid = ""): Promise<TSClientAvatar | null> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    const client = this.client;
    const paced: TeamSpeakAvatarClient = {
      execCommandWithResponse: (command: string, timeoutMs?: number) =>
        this.pacer.run(() => client.execCommandWithResponse(command, timeoutMs)),
      fileTransferInitDownload: client.fileTransferInitDownload.bind(client),
      downloadFileData: client.downloadFileData.bind(client),
    };
    return loadClientAvatar(paced, this.options.target.host, clientId, expectedUid);
  }

  private attachClientListeners(client: TS3FullClient): void {
    client.on("voiceData", (data: VoiceData) => {
      this.emit("voiceData", {
        clientId: data.clientId,
        codec: data.codec,
        data: Buffer.from(data.data),
      } as TSVoiceData);
    });

    // Directory the server sends during welcome, connect() also reconciles it with a full snapshot.
    client.on("directorySnapshot", (snapshot) => {
      this.emit("directorySnapshot", {
        channels: snapshot.channels.slice(),
        clients: snapshot.clients.slice(),
      });
    });

    client.on("rawNotification", (notification: RawNotification) => {
      this.emit("rawNotification", {
        name: notification.name,
        params: { ...notification.params },
      } satisfies TSRawNotification);
    });

    client.on("textMessage", (msg) => {
      this.emit("textMessage", toTSChatMessage(msg));
    });

    client.on("poked", (event) => {
      this.emit("poked", event);
    });

    client.on("disconnected", (err) => {
      if (err) {
        const normalized = normalizeTeamSpeakError(err);
        this.logger.warn(
          {
            failureCode: normalized.code.toUpperCase(),
            failureDetail: describeTeamSpeakError(normalized),
          },
          "TeamSpeak transport disconnected unexpectedly",
        );
      } else {
        this.logger.info("TeamSpeak transport disconnected");
      }
      this.connected = false;
      this.clientId = 0;
      this.emit("disconnected", err);
    });

    client.on("clientEnter", (info) => {
      this.emit("clientEnter", info);
    });

    client.on("clientLeave", (info) => {
      if (info.id === this.clientId && (info.reasonID === 4 || info.reasonID === 5)) this.selfLeaveReasonId = info.reasonID;
      this.emit("clientLeave", info);
    });

    // The SDK emits kicked only for a self leave with reason 4 or 5 and passes just the admin's
    // message. Without this the browser only saw a generic connection failure.
    client.on("kicked", (reasonMsg) => {
      const reasonId = this.selfLeaveReasonId;
      this.selfLeaveReasonId = null;
      this.emit("kicked", normalizeTeamSpeakKickedReason(reasonMsg, reasonId));
    });

    client.on("clientMoved", (info) => {
      if (info.id === this.clientId && info.targetChannelID !== 0n) this.preferredChannelId = info.targetChannelID;
      this.emit("clientMoved", info);
    });

    client.on("clientUpdated", (event) => {
      this.emit("clientUpdated", event.info);
    });
  }

  sendVoice(data: Buffer, codec: number = 4): void {
    if (!this.client || !this.connected) return;
    this.client.sendVoice(data, codec);
  }

  sendWhisper(data: Buffer, clientIds: number[], codec: number = 4): void {
    if (!this.client || !this.connected) return;
    const targets = [...new Set(clientIds)].filter(
      (clientId) => Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== this.getClientId(),
    );
    if (!targets.length) throw new Error("Whisper requires at least one valid target");
    this.client.sendWhisper(data, targets, codec);
  }

  async sendTextMessage(scope: TSChatScope, message: string, targetId = 0n): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    const targetMode = scope === "private" ? 1 : scope === "server" ? 3 : 2;
    await tsSendTextMessage(this.client, targetMode, targetId, message);
  }

  async poke(clientId: number, message: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    await tsPoke(this.client, clientId, message);
  }

  async setAway(away: boolean, message = ""): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    const escaped = escapeTeamSpeakValue(message);
    const client = this.client;
    await this.pacer.run(() => client.execCommand(`clientupdate client_away=${away ? 1 : 0} client_away_message=${escaped}`));
  }

  async setInputMuted(muted: boolean): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    const client = this.client;
    await this.pacer.run(() => client.execCommand(`clientupdate client_input_muted=${muted ? 1 : 0}`));
  }

  async switchChannel(channelId: bigint, password?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    await tsClientMove(this.client, this.clientId, channelId, password);
    this.preferredChannelId = channelId;
  }

  /** The server checks both move powers. */
  async moveClient(clientId: number, channelId: bigint, password?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    if (!Number.isInteger(clientId) || clientId <= 0 || clientId > 65535) throw new Error("Invalid TeamSpeak client id");
    await tsClientMove(this.client, clientId, channelId, password);
  }

  getClientId(): number {
    // The SDK learns the real client id during welcome, before connect() resumes. Reading it
    // here keeps the first directory snapshot from missing the web client.
    return this.client?.clientID() ?? this.clientId;
  }

  getProtocol(): TeamSpeakProtocol | null {
    return this.adapter?.protocol ?? null;
  }

  async execCommandWithResponse(command: string, timeoutMs = 3000): Promise<Record<string, string>[]> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    return this.client.execCommandWithResponse(command, timeoutMs);
  }

  /**
   * Send a protocol command whose answer arrives later as a notification (setupstream etc).
   * Only the trusted stream adapter builds these, never the browser.
   */
  async sendProtocolCommand(command: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    await this.client.sendCommandNoWait(command);
  }

  getIdentityString(): string {
    return this.identity.toString();
  }

  getChannelId(): bigint {
    if (!this.client) return 0n;
    const sdkClient = this.client as unknown as { channelID?: () => bigint };
    return sdkClient.channelID?.() ?? 0n;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.selfLeaveReasonId = null;
    try {
      if (this.adapter) await this.adapter.disconnect();
    } finally {
      this.accelerationClient?.close();
      this.accelerationClient = null;
      this.adapter = null;
      this.client = null;
      this.clientId = 0;
    }
  }
}

function escapeTeamSpeakValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "\\s")
    .replace(/\//g, "\\/")
    .replace(/\|/g, "\\p")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}
