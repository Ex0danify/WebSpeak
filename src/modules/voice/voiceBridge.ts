import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { TSClient, IdentityLeaseStore, type TSClientOptions } from "../teamspeak/index.js";
import type { Logger as LoggerType } from "../../shared/logger.js";
import { JoinTicketStore, type JoinTicketPayload } from "../join/index.js";
import { SessionManager, type SessionTeardownReason } from "./session/voiceSessionManager.js";
import type { AdminSessionSummary, WebClientEntry } from "./voiceTypes.js";
import { type VoiceDirectoryDeps } from "./directory/voiceDirectory.js";
import { sendInitialState } from "./session/voiceConnection.js";
import { admitConnection, type AdmissionDeps, type ConnectionHooks } from "./voiceAdmission.js";
import type { WebRtcAudioOptions } from "../../config/webrtcConfig.js";
import type { TsClientVersion } from "../../config/env.js";
import { cleanupEntry, getSessionSummaries, terminateSession, type SessionCleanupDeps } from "./session/voiceSessionAdmin.js";
import type { ConfiguredAccelerationRelay } from "../relay/index.js";
import {
  ScreenShareHub,
  discoverExistingTeamSpeakStreams,
  handleScreenShareMessage,
  normalizeScreenShareIceServers,
  type ScreenShareIceServer,
} from "../screenShare/index.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface VoiceBridgeOptions {
  joinTickets: JoinTicketStore;
  webRtc?: WebRtcAudioOptions | (() => WebRtcAudioOptions);
  screenShareIceServers?: ScreenShareIceServer[] | (() => ScreenShareIceServer[]);
  acceleration?: ConfiguredAccelerationRelay[] | (() => ConfiguredAccelerationRelay[]);
  accelerationName?: string | (() => string | undefined);
  createClient?: (options: TSClientOptions, logger: LoggerType) => TSClient;
  clientVersion?: TsClientVersion;
  /** How long a connected TeamSpeak client may take to deliver its first directory snapshot. */
  directorySyncTimeoutMs?: number;
}

const DIRECTORY_SYNC_TIMEOUT_MS = 15_000;

export class VoiceBridge {
  private readonly sessionManager = new SessionManager();
  private readonly entries = new Map<string, WebClientEntry>();
  private readonly screenHub: ScreenShareHub;
  private readonly identityLeases = new IdentityLeaseStore();
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private logger: LoggerType;
  private readonly hooks: ConnectionHooks;
  private readonly directoryDeps: VoiceDirectoryDeps;
  private readonly cleanupDeps: SessionCleanupDeps;
  private readonly admissionDeps: AdmissionDeps;

  constructor(
    private options: VoiceBridgeOptions,
    logger: LoggerType,
  ) {
    this.logger = logger.child({ component: "voice-bridge" });
    this.screenHub = new ScreenShareHub({
      getParticipant: (entryId) => this.entries.get(entryId),
      participants: () => this.entries.values(),
      getIceServers: () => this.getScreenShareIceServers(),
      logger: this.logger,
    });
    this.hooks = {
      teardown: (entryId, reason) => this.teardown(entryId, reason),
      getWebRtcOptions: () => this.getWebRtcOptions(),
      handleScreenShareMessage: (entry, message, sendJson) => handleScreenShareMessage(this.screenHub, entry, message, sendJson),
      getScreenShareIceServers: () => this.getScreenShareIceServers(),
      directorySyncTimeoutMs: () => this.options.directorySyncTimeoutMs ?? DIRECTORY_SYNC_TIMEOUT_MS,
      discoverExistingTeamSpeakStreams: (entry) => discoverExistingTeamSpeakStreams(this.screenHub, entry),
    };
    this.directoryDeps = {
      sendInitialState: (ctx) => sendInitialState(ctx, this.hooks),
      reconcileScreenShareAfterClientMove: (entry, clientId, targetChannelId) =>
        this.screenHub.reconcileScreenShareAfterClientMove(entry, clientId, targetChannelId),
      reconcileNativeScreenShareAfterClientLeave: (entry, clientId) =>
        this.screenHub.reconcileNativeScreenShareAfterClientLeave(entry, clientId),
    };
    this.cleanupDeps = {
      entries: this.entries,
      identityLeases: this.identityLeases,
      logger: this.logger,
      removeScreenSharePeer: (entryId) => this.screenHub.removeScreenSharePeer(entryId),
      forgetScreenStreams: () => {
        this.screenHub.screenStreams.clear();
        this.screenHub.screenStreamDiscoveryTargets.clear();
      },
    };
    this.admissionDeps = {
      logger: this.logger,
      sessionManager: this.sessionManager,
      entries: this.entries,
      identityLeases: this.identityLeases,
      screenHub: this.screenHub,
      hooks: this.hooks,
      directoryDeps: this.directoryDeps,
      createClient: this.options.createClient,
      clientVersion: this.options.clientVersion,
      resolveConnection: (url) => this.resolveConnection(url),
      getAccelerationOptions: (relayId) => this.getAccelerationOptions(relayId),
      teardown: (entryId, reason) => this.teardown(entryId, reason),
      cleanupEntry: (entry, reason) => this.cleanupEntry(entry, reason),
    };
  }

  attach(server: Server): void {
    // Avatars travel as a data URL in memberAvatar, keep the frame limit above the encoded ceiling plus JSON.
    this.wss = new WebSocketServer({ server, path: "/ws/voice", maxPayload: 512 * 1024 });
    this.startHeartbeat();

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      admitConnection(this.admissionDeps, ws, req);
    });

    this.wss.on("error", (error) => {
      this.logger.error({ err: error }, "Voice WebSocket server error");
    });
    this.logger.info("Voice WebSocket endpoint ready at /ws/voice");
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await this.sessionManager.shutdown("gateway-shutdown");
    const wss = this.wss;
    this.wss = null;
    if (!wss) return;
    await new Promise<void>((resolve) => {
      try {
        wss.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  getActiveCount(): number {
    return this.sessionManager.activeCount;
  }

  getPeakCount(): number {
    return this.sessionManager.peakCount;
  }

  getCreatedCount(): number {
    return this.sessionManager.createdCount;
  }

  getSessionSummaries(): AdminSessionSummary[] {
    return getSessionSummaries(this.entries);
  }

  async terminateSession(entryId: string): Promise<boolean> {
    return terminateSession(this.entries, this.sessionManager, entryId);
  }

  private async teardown(entryId: string, reason: SessionTeardownReason): Promise<void> {
    await this.sessionManager.teardown(entryId, reason);
  }

  private async cleanupEntry(entry: WebClientEntry, reason: SessionTeardownReason): Promise<void> {
    await cleanupEntry(entry, reason, this.cleanupDeps);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      for (const entry of this.entries.values()) {
        if (entry.ws.readyState !== WebSocket.OPEN) continue;
        if (!entry.isAlive) {
          entry.ws.terminate();
          void this.teardown(entry.id, "heartbeat-timeout");
          continue;
        }
        entry.isAlive = false;
        entry.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private resolveConnection(url: URL): JoinTicketPayload | null {
    const token = url.searchParams.get("ticket");
    return token ? this.options.joinTickets.consume(token) : null;
  }

  private getWebRtcOptions(): WebRtcAudioOptions | undefined {
    const configured = this.options.webRtc;
    return typeof configured === "function" ? configured() : configured;
  }

  private getScreenShareIceServers(): ScreenShareIceServer[] {
    const configured = this.options.screenShareIceServers;
    const servers = typeof configured === "function" ? configured() : configured;
    return normalizeScreenShareIceServers(servers);
  }

  private getAccelerationOptions(relayId = ""): ConfiguredAccelerationRelay | undefined {
    const configured = this.options.acceleration;
    const relays = typeof configured === "function" ? configured() : configured;
    if (!relays?.length) return undefined;
    const selected = relayId ? relays.find((relay) => relay.id === relayId) : relays[0];
    if (!selected) return undefined;
    return selected;
  }
}
