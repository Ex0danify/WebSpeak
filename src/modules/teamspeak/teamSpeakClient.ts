import { EventEmitter } from "node:events";
import {
  channelSubscribeAll,
  clientMove,
  clientPoke,
  clientUpdate,
  generateIdentity,
  sendTextMessage,
  TextMessageTarget,
  type Identity,
} from "../../lib/teamspeak/index.js";
import type { Logger } from "../../shared/logger.js";
import { describeTeamSpeakError, normalizeTeamSpeakError } from "../../shared/errors.js";
import type { TSChatScope } from "./teamSpeakMessages.js";
import { InputMuteSync } from "./inputMuteSync.js";
import { OutputMuteSync } from "./outputMuteSync.js";
import { sendStreamCommand } from "./teamSpeakStreamCommand.js";
import { NativeBackend } from "./nativeBackend.js";
import type { TeamSpeakBackend, TeamSpeakBackendEvents, TeamSpeakBackendFactory, TSClientAvatar } from "./teamSpeakBackend.js";
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

export type { TSClientAvatar };
export type * from "./teamSpeakMessages.js";

const createDefaultBackend: TeamSpeakBackendFactory = (options, logger) => new NativeBackend(options, logger);

// Re-emitted as they come, the rest needs TSClient's own bookkeeping first.
const FORWARDED_EVENTS = [
  "voiceData",
  "directorySnapshot",
  "rawNotification",
  "textMessage",
  "poked",
  "clientEnter",
  "clientLeave",
  "clientUpdated",
  "kicked",
] as const satisfies readonly (keyof TeamSpeakBackendEvents)[];

const TEXT_TARGET_MODES = { private: TextMessageTarget.client, channel: TextMessageTarget.channel, server: TextMessageTarget.server };

export class TSClient extends EventEmitter {
  private backend: TeamSpeakBackend | null = null;
  private logger: Logger;
  private readonly identity: Identity;
  private clientId = 0;
  private connected = false;
  private preferredChannelId = 0n;
  private accelerationClient: AccelerationRelayClient | null = null;
  // Bumped by disconnect(), a connect() already in flight gives up when it sees the change.
  private connectGeneration = 0;
  private readonly inputMute = new InputMuteSync();
  private readonly outputMute = new OutputMuteSync();

  constructor(
    private options: TSClientOptions,
    logger: Logger,
    private readonly createBackend: TeamSpeakBackendFactory = createDefaultBackend,
  ) {
    super();
    this.logger = logger.child({ nickname: options.nickname });
    this.identity = options.identity ?? generateIdentity(8);
  }

  /** Returns without a session when disconnect() ran first, the handshake would otherwise finish and leak a connection. */
  async connect(): Promise<void> {
    const generation = this.connectGeneration;
    this.inputMute.reset();
    this.outputMute.reset();
    // A self-closed tunnel leaves the backend on a dead local port and reports nothing, so rebuild both.
    if (this.accelerationClient?.isClosed()) await this.retireTransport();
    if (!this.backend) {
      let transportTarget = this.options.target;
      if (this.options.acceleration && !this.accelerationClient) {
        this.accelerationClient = await createAccelerationRelayClient({
          ...this.options.acceleration,
          host: this.options.target.host,
          port: this.options.target.port,
        });
        transportTarget = { host: this.accelerationClient.localHost, port: this.accelerationClient.localPort };
        if (generation !== this.connectGeneration) return this.releaseAcceleration();
      }
      this.backend = this.createBackend(
        {
          transportTarget,
          serverHost: this.options.target.host,
          nickname: this.options.nickname,
          identity: this.identity,
          serverPassword: this.options.serverPassword,
          defaultChannel: this.options.defaultChannel,
          channelPassword: this.options.channelPassword,
        },
        this.logger,
      );
      this.attachBackendListeners(this.backend);
    }
    const backend = this.backend;

    try {
      await backend.connect();
    } catch (error: unknown) {
      if (generation !== this.connectGeneration) return;
      throw error;
    }
    if (generation !== this.connectGeneration) {
      await backend.disconnect();
      return;
    }

    this.clientId = backend.clientId();
    try {
      // Native clients subscribe to the whole channel tree after welcome. Without it members
      // vanish from the list as soon as they leave our channel.
      await backend.command(channelSubscribeAll(), 5000, "background");
    } catch (error: unknown) {
      this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not subscribe to all TeamSpeak channels");
    }
    try {
      await backend.syncDirectory();
    } catch (error: unknown) {
      this.logger.warn(
        {
          failureCode: "DIRECTORY_SNAPSHOT_UNAVAILABLE",
          failureDetail: error instanceof Error ? error.message : String(error),
        },
        "TeamSpeak directory snapshot unavailable",
      );
    }

    const connectedChannelId = backend.channelId();
    if (this.preferredChannelId === 0n) {
      this.preferredChannelId = connectedChannelId;
    } else if (connectedChannelId !== this.preferredChannelId) {
      try {
        await backend.command(clientMove({ clientId: this.clientId, channelId: this.preferredChannelId }));
      } catch (error: unknown) {
        // The old channel may be gone or off limits, the server already put us in the default channel.
        this.logger.info(
          {
            channelId: this.preferredChannelId.toString(),
            err: error instanceof Error ? error.message : String(error),
          },
          "Previous TeamSpeak channel could not be restored",
        );
        this.preferredChannelId = backend.channelId();
      }
    }
    this.connected = true;

    this.logger.info({ clientId: this.clientId }, "Connected to TeamSpeak");
    this.emit("connected", this.clientId);
  }

  async getClientAvatar(clientId: number, expectedUid = ""): Promise<TSClientAvatar | null> {
    const backend = this.readyBackend();
    // A reconnect replaces the backend, whatever the old one still returns belongs to another session.
    try {
      const avatar = await backend.loadAvatar(clientId, expectedUid);
      return this.backend === backend ? avatar : null;
    } catch (error: unknown) {
      if (this.backend !== backend) return null;
      throw error;
    }
  }

  private attachBackendListeners(backend: TeamSpeakBackend): void {
    for (const event of FORWARDED_EVENTS) backend.on(event, (payload: unknown) => this.emit(event, payload));

    backend.on("clientMoved", (info) => {
      if (info.id === this.clientId && info.targetChannelID !== 0n) this.preferredChannelId = info.targetChannelID;
      this.emit("clientMoved", info);
    });

    backend.on("disconnected", (err) => {
      if (this.backend !== backend) return; // a retired backend's late end must not re-enter the reconnect path
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
  }

  sendVoice(data: Buffer, codec: number = 4): void {
    if (!this.backend || !this.connected) return;
    this.backend.sendVoice(data, codec);
  }

  sendWhisper(data: Buffer, clientIds: number[], codec: number = 4): void {
    if (!this.backend || !this.connected) return;
    const targets = [...new Set(clientIds)].filter(
      (clientId) => Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== this.getClientId(),
    );
    if (!targets.length) throw new Error("Whisper requires at least one valid target");
    this.backend.sendWhisper(data, targets, codec);
  }

  /** Waits for the server's answer, so a refusal (a client that has left, a muted channel) reaches the sender. */
  async sendTextMessage(scope: TSChatScope, message: string, targetId = 0n): Promise<void> {
    const backend = this.readyBackend();
    await backend.command(sendTextMessage(TEXT_TARGET_MODES[scope], targetId, message), undefined, "background");
  }

  async poke(clientId: number, message: string): Promise<void> {
    await this.readyBackend().command(clientPoke(clientId, message));
  }

  async setAway(away: boolean, message = ""): Promise<void> {
    const backend = this.readyBackend();
    await backend.command(clientUpdate({ away, awayMessage: message }), undefined, "background");
  }

  async setInputMuted(muted: boolean): Promise<void> {
    const backend = this.readyBackend();
    await this.inputMute.setMicMuted(muted, this.muteTarget(backend), () => this.backend === backend);
  }

  /** Marks this client as deafened (or not) for everyone on the TeamSpeak server. */
  async setOutputMuted(muted: boolean): Promise<void> {
    const backend = this.readyBackend();
    await this.outputMute.setOutputMuted(muted, this.muteTarget(backend), () => this.backend === backend);
  }

  /** Accompaniment keeps the TeamSpeak input unmuted so a muted mic does not silence the shared audio. */
  async setAccompanimentActive(active: boolean): Promise<void> {
    const backend = this.readyBackend();
    await this.inputMute.setAccompanimentActive(active, this.muteTarget(backend), () => this.backend === backend);
  }

  async switchChannel(channelId: bigint, password?: string): Promise<void> {
    await this.readyBackend().command(clientMove({ clientId: this.clientId, channelId, password }));
    this.preferredChannelId = channelId;
  }

  /** The server checks both move powers. */
  async moveClient(clientId: number, channelId: bigint, password?: string): Promise<void> {
    const backend = this.readyBackend();
    if (!Number.isInteger(clientId) || clientId <= 0 || clientId > 65535) throw new Error("Invalid TeamSpeak client id");
    await backend.command(clientMove({ clientId, channelId, password }));
  }

  getClientId(): number {
    // The real client id is known during the welcome, before connect() resumes. Reading it
    // here keeps the first directory snapshot from missing the web client.
    return this.backend?.clientId() ?? this.clientId;
  }

  getProtocol(): TeamSpeakProtocol | null {
    return this.backend?.protocol ?? null;
  }

  async execCommandWithResponse(command: string, timeoutMs = 3000): Promise<Record<string, string>[]> {
    return this.readyBackend().command(command, timeoutMs);
  }

  /** Only the trusted stream adapter builds these commands, never the browser. */
  async sendProtocolCommand(command: string): Promise<void> {
    await sendStreamCommand(this.readyBackend(), this.logger, command);
  }

  getIdentityString(): string {
    return this.identity.toString();
  }

  getChannelId(): bigint {
    return this.backend?.channelId() ?? 0n;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private readyBackend(): TeamSpeakBackend {
    if (!this.backend || !this.connected) throw new Error("TeamSpeak session is not ready");
    return this.backend;
  }

  private muteTarget(backend: TeamSpeakBackend) {
    return { execCommand: (command: string) => backend.command(command, undefined, "background") };
  }

  private releaseAcceleration(): void {
    this.accelerationClient?.close();
    this.accelerationClient = null;
  }

  /** Drops backend and tunnel so the next connect() builds fresh ones. */
  private async retireTransport(): Promise<void> {
    const backend = this.backend;
    this.backend = null;
    this.connected = false;
    this.clientId = 0;
    this.releaseAcceleration();
    this.logger.warn("Acceleration tunnel closed on its own, rebuilding");
    await backend?.disconnect().catch(() => undefined);
  }

  async disconnect(): Promise<void> {
    this.connectGeneration++;
    this.inputMute.reset();
    this.outputMute.reset();
    this.connected = false;
    const backend = this.backend;
    try {
      if (backend) await backend.disconnect();
    } finally {
      this.releaseAcceleration();
      this.backend = null;
      this.clientId = 0;
    }
  }
}
