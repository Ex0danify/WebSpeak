import { EventEmitter } from "node:events";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  resolveAddress,
  TeamSpeakConnection,
  type CommandPriority,
  type CommandRequest,
  type TeamSpeakConnectionOptions,
  type UdpAddress,
} from "../../lib/teamspeak/index.js";
import type { Logger } from "../../shared/logger.js";
import { normalizeTeamSpeakError } from "../../shared/errors.js";
import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";
import { detectTeamSpeakProtocol } from "./teamSpeakAdapter.js";
import { forwardConnectionEvents } from "./nativeEvents.js";
import {
  MAX_CLIENT_AVATAR_BYTES,
  type TeamSpeakBackend,
  type TeamSpeakBackendEvents,
  type TeamSpeakBackendOptions,
  type TSClientAvatar,
} from "./teamSpeakBackend.js";

const CONNECT_TIMEOUT_MS = 15_000;

export interface NativeBackendSeams {
  connection?: (options: TeamSpeakConnectionOptions) => TeamSpeakConnection;
  /** Host name to the address the UDP socket connects to. */
  resolve?: (host: string, port: number) => Promise<UdpAddress>;
}

/**
 * SRV and TSDNS like the native client, then the address. Open mode hands us a checked IP, so
 * this only runs for a name an admin configured.
 */
async function resolveTarget(host: string, port: number): Promise<UdpAddress> {
  if (isIP(host)) return { host, port };
  const [candidate] = await resolveAddress(host, { port });
  const address = await lookup(candidate?.host ?? host);
  return { host: address.address, port: candidate?.port ?? port };
}

/** TSClient on the own TeamSpeak client in lib/teamspeak. */
export class NativeBackend extends EventEmitter<TeamSpeakBackendEvents> implements TeamSpeakBackend {
  private connection: TeamSpeakConnection | null = null;
  private stopped = false;

  constructor(
    private readonly options: TeamSpeakBackendOptions,
    private readonly logger: Logger,
    private readonly seams: NativeBackendSeams = {},
  ) {
    super();
  }

  get protocol(): TeamSpeakProtocol | null {
    return this.connection ? detectTeamSpeakProtocol(this.connection.session.server.version) : null;
  }

  async connect(): Promise<void> {
    const { transportTarget } = this.options;
    const address = await (this.seams.resolve ?? resolveTarget)(transportTarget.host, transportTarget.port);
    if (this.stopped) return;
    const connectionOptions: TeamSpeakConnectionOptions = {
      address,
      identity: this.options.identity,
      nickname: this.options.nickname,
      serverPassword: this.options.serverPassword,
      defaultChannel: this.options.defaultChannel,
      defaultChannelPassword: this.options.channelPassword,
      timeoutMs: CONNECT_TIMEOUT_MS,
      transport: { logger: this.logger },
    };
    const connection = (this.seams.connection ?? ((options) => new TeamSpeakConnection(options)))(connectionOptions);
    this.connection = connection;
    forwardConnectionEvents(connection, this);
    this.logger.info({ target: `${address.host}:${address.port}` }, "Connecting with the own TeamSpeak client");
    try {
      await connection.connect();
    } catch (error: unknown) {
      throw normalizeTeamSpeakError(error);
    }
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    await this.connection?.disconnect();
  }

  clientId(): number {
    return this.connection?.clientId ?? 0;
  }

  channelId(): bigint {
    return this.connection?.session.self.channelId ?? 0n;
  }

  async command(request: CommandRequest | string, timeoutMs = 10_000, priority?: CommandPriority): Promise<Record<string, string>[]> {
    const rows = await this.live().command(request, { timeoutMs, priority });
    return rows.map((row) => ({ ...row }));
  }

  async send(text: string): Promise<void> {
    this.live().send(text);
  }

  sendVoice(data: Buffer, codec: number): void {
    this.connection?.sendVoice(data, codec);
  }

  sendWhisper(data: Buffer, clientIds: number[], codec: number): void {
    this.connection?.sendWhisper(data, { clientIds }, codec);
  }

  async loadAvatar(clientId: number, expectedUid: string): Promise<TSClientAvatar | null> {
    const connection = this.live();
    const client = connection.session.client(clientId);
    if (!client || (expectedUid && client.uid !== expectedUid)) return null;
    // Server and file port refusals, a missing file or one too large all leave the initial letter.
    const avatar = await connection.downloadAvatar(clientId, {
      maxBytes: MAX_CLIENT_AVATAR_BYTES,
      host: this.options.serverHost,
      priority: "background",
    });
    return avatar && avatar.data.length > 0 ? avatar : null;
  }

  async syncDirectory(): Promise<void> {
    this.emit("directorySnapshot", this.live().session.snapshot());
  }

  private live(): TeamSpeakConnection {
    if (!this.connection || this.connection.state !== "connected") throw new Error("TeamSpeak session is not ready");
    return this.connection;
  }
}
