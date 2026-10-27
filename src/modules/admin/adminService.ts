import { MAX_ACTIVE_SESSIONS } from "../../shared/constants.js";
import type { Logger } from "../../shared/logger.js";
import { formatTeamSpeakTarget, parseTeamSpeakTarget, type TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import { type AccessMode, WebSpeakDatabase } from "../../infra/persistence/database.js";
import { hashAdminPassword, validateAdminPassword, verifyAdminPassword } from "../../infra/security/adminPassword.js";
import { decryptSecret } from "../../infra/security/secretCrypto.js";
import { probeTeamSpeak, TeamSpeakProbeError } from "../teamspeak/index.js";
import { pingTeamSpeakHost, type TeamSpeakPingResult } from "../relay/index.js";
import { type ConfiguredAccelerationRelay } from "../relay/index.js";
import { type WebRtcAudioOptions } from "../../config/webrtcConfig.js";
import { type IdentityMintPolicy } from "../../config/identityMintConfig.js";
import { DEFAULT_WELCOME_TEXTS, resolveWelcomeTexts } from "./siteCopy.js";
import { AdminInputError } from "./adminErrors.js";
import { diffFields, relayNodesChanged, sortedEntries } from "./auditChanges.js";
import { AdminServerService, type ResolvedServer, type ServerInput, type ServerView } from "./adminServerService.js";
import { AdminInviteService, type ManagedInviteInput, type ManagedInviteQuery, type ManagedInviteView } from "./adminInviteService.js";
import { AdminBootstrapError, type AdminBootstrap } from "./adminBootstrap.js";
import { normalizeRelayNodes, normalizeSettings, toSettingsUpdate, type AdminSettingsInput } from "./adminSettingsNormalizer.js";

export { AdminInputError };
export type { ManagedInviteInput, ManagedInviteQuery, ManagedInviteView } from "./adminInviteService.js";
export type { ResolvedServer, ServerInput, ServerView } from "./adminServerService.js";
export type { AdminSettingsInput, RelayNodeInput } from "./adminSettingsNormalizer.js";

type ProbeFunction = typeof probeTeamSpeak;
type HostPingFunction = (host: string) => Promise<TeamSpeakPingResult>;

/** What Test connection reports. ok is the voice port's answer, the host ping is just context. */
export interface ConnectionTestResult {
  ok: boolean;
  /** Round trip of the handshake packet, null when nothing answered. */
  latencyMs: number | null;
  errorCode?: string;
  /** Ping of the host from the WebSpeak machine. A host that drops ICMP can fail it while the server is fine. */
  hostPing: {
    ok: boolean;
    latencyMs: number | null;
    packetLossPercent: number;
    attempts: number;
    successfulAttempts: number;
    errorCode?: string;
  };
}

/** The dashboard snapshot: gateway status, the servers with their last test, session counts and the active invites. */
export interface AdminOverview {
  gateway: { status: "running"; version: string; uptimeSeconds: number };
  servers: Array<{
    id: string;
    name: string;
    target: string;
    status: "unreachable" | "reachable" | "unknown";
    lastTestAt: string | null;
    latencyMs: number | null;
    lastError: string | null;
  }>;
  sessions: { active: number; peak: number; limit: number };
  invites: { active: number };
}

export class AdminService {
  private readonly invites: AdminInviteService;
  private readonly servers: AdminServerService;

  constructor(
    readonly database: WebSpeakDatabase,
    private readonly masterSecret: Buffer,
    private readonly logger: Logger,
    private readonly probe: ProbeFunction = probeTeamSpeak,
    private readonly version = "0.1.0",
    private readonly hostPing: HostPingFunction = (host) => pingTeamSpeakHost(host, { attempts: 4 }),
  ) {
    this.invites = new AdminInviteService(database, masterSecret, logger);
    this.servers = new AdminServerService(database, masterSecret, logger);
  }

  /**
   * Creates the administrator account on a fresh database from the bootstrap credentials. An existing account is
   * left alone, so the bootstrap values only matter once. Without them a fresh database cannot start.
   */
  async initialize(bootstrap?: AdminBootstrap): Promise<void> {
    if (this.database.hasAdmin()) return;
    if (!bootstrap) {
      throw new AdminBootstrapError(
        "No administrator account exists yet. Set WEBSPEAK_ADMIN_PASSWORD (at least 12 characters) in .env or the environment.",
      );
    }
    const credential = await hashAdminPassword(bootstrap.password, { username: bootstrap.username, mustChangePassword: true });
    this.database.initializeAdmin(credential, toSettingsUpdate(this.database.getSettings()));
    this.logger.info({ username: bootstrap.username }, "Administrator account created. The password must be changed at the first login.");
  }

  isInitialized(): boolean {
    return this.database.hasAdmin();
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    const credential = this.database.getAdminCredential();
    return credential?.username === username && (await verifyAdminPassword(password, credential));
  }

  isPasswordChangeRequired(): boolean {
    return this.database.getAdminCredential()?.mustChangePassword === true;
  }

  async changePassword(password: string, ip?: string): Promise<void> {
    const credential = this.database.getAdminCredential();
    if (!credential) throw new AdminInputError("NOT_INITIALIZED", "The administrator account is not initialized");
    const passwordError = validateAdminPassword(password);
    if (passwordError) throw new AdminInputError("INVALID_ADMIN_PASSWORD", passwordError);
    const replacement = await hashAdminPassword(password, { username: credential.username, mustChangePassword: false });
    this.database.updateAdminCredential(replacement);
    this.database.addAudit("ADMIN_PASSWORD_CHANGED", { ip });
  }

  getPublicConfig(): Record<string, unknown> {
    const settings = this.database.getSettings();
    const welcomeTexts = resolveWelcomeTexts(settings.welcomeTexts);
    return {
      version: this.version,
      initialized: this.isInitialized(),
      siteName: settings.siteName,
      // Complete map with the default filled in for every language without a stored text.
      welcomeTexts,
      accessMode: settings.accessMode,
      // Names only, the addresses of the configured servers stay with the administrator.
      servers: this.servers.list().map(({ id, name }) => ({ id, name })),
    };
  }

  getAdminSettings(): Record<string, unknown> {
    const settings = this.database.getSettings();
    return {
      servers: this.servers.list(),
      accessMode: settings.accessMode,
      siteName: settings.siteName,
      welcomeTexts: settings.welcomeTexts,
      welcomeDefaults: DEFAULT_WELCOME_TEXTS,
      webRtcEnabled: settings.webRtcEnabled,
      webRtcUdpStart: settings.webRtcUdpStart,
      webRtcUdpEnd: settings.webRtcUdpEnd,
      identityMintMaxLevel: settings.identityMintMaxLevel,
      identityMintConcurrency: settings.identityMintConcurrency,
      identityMintQueueDepth: settings.identityMintQueueDepth,
      eventLogRetentionDays: settings.retention.eventLog.days,
      eventLogMaxRows: settings.retention.eventLog.maxRows,
      connectionRetentionDays: settings.retention.connections.days,
      connectionMaxRows: settings.retention.connections.maxRows,
      relayNodes: this.getRelayNodeViews(),
      updatedAt: settings.updatedAt,
    };
  }

  getWebRtcAudioOptions(): WebRtcAudioOptions {
    const settings = this.database.getSettings();
    return {
      enabled: settings.webRtcEnabled,
      udpPortRange: [settings.webRtcUdpStart, settings.webRtcUdpEnd],
    };
  }

  getIdentityMintPolicy(): IdentityMintPolicy {
    const settings = this.database.getSettings();
    return {
      maxLevel: settings.identityMintMaxLevel,
      concurrency: settings.identityMintConcurrency,
      queueDepth: settings.identityMintQueueDepth,
    };
  }

  getAccelerationRelayOptions(): ConfiguredAccelerationRelay[] {
    const relays: ConfiguredAccelerationRelay[] = [];
    for (const node of this.database.listRelayNodes()) {
      if (!node.enabled || !node.host || !node.tokenEncrypted) continue;
      try {
        const token = decryptSecret(node.tokenEncrypted, this.masterSecret);
        relays.push({ id: node.id, name: node.name, relayHost: node.host, relayPort: node.port, token });
      } catch (error: unknown) {
        this.logger.error(
          { err: error instanceof Error ? error.message : String(error), relayId: node.id },
          "Stored acceleration relay token could not be decrypted",
        );
      }
    }
    return relays;
  }

  getAccelerationRelayName(): string | undefined {
    return this.getAccelerationRelayOptions()[0]?.name;
  }

  updateSettings(input: AdminSettingsInput, ip?: string): void {
    const current = this.database.getSettings();
    const relayNodes =
      input.relayNodes === undefined ? undefined : normalizeRelayNodes(input.relayNodes, this.database.listRelayNodes(), this.masterSecret);
    const settings = normalizeSettings(input, current);
    if (settings.accessMode === "fixed" && this.servers.list().length === 0) {
      throw new AdminInputError("SERVERS_REQUIRED", "Add a server before limiting access to the server list");
    }
    const changes = diffFields(
      {
        siteName: current.siteName,
        accessMode: current.accessMode,
        webRtcEnabled: current.webRtcEnabled,
        webRtcUdpStart: current.webRtcUdpStart,
        webRtcUdpEnd: current.webRtcUdpEnd,
        identityMintMaxLevel: current.identityMintMaxLevel,
        identityMintConcurrency: current.identityMintConcurrency,
        identityMintQueueDepth: current.identityMintQueueDepth,
        eventLogRetentionDays: current.retention.eventLog.days,
        eventLogMaxRows: current.retention.eventLog.maxRows,
        connectionRetentionDays: current.retention.connections.days,
        connectionMaxRows: current.retention.connections.maxRows,
      },
      {
        siteName: settings.siteName,
        accessMode: settings.accessMode,
        webRtcEnabled: settings.webRtcEnabled,
        webRtcUdpStart: settings.webRtcUdpStart,
        webRtcUdpEnd: settings.webRtcUdpEnd,
        identityMintMaxLevel: settings.identityMintMaxLevel,
        identityMintConcurrency: settings.identityMintConcurrency,
        identityMintQueueDepth: settings.identityMintQueueDepth,
        eventLogRetentionDays: settings.retention?.eventLog.days,
        eventLogMaxRows: settings.retention?.eventLog.maxRows,
        connectionRetentionDays: settings.retention?.connections.days,
        connectionMaxRows: settings.retention?.connections.maxRows,
      },
    );
    if (
      settings.welcomeTexts !== undefined &&
      JSON.stringify(sortedEntries(settings.welcomeTexts)) !== JSON.stringify(sortedEntries(current.welcomeTexts))
    ) {
      changes.push({ field: "welcomeTexts" });
    }
    if (relayNodes !== undefined && relayNodesChanged(this.database.listRelayNodes(), relayNodes)) changes.push({ field: "relayNodes" });
    this.database.updateSettings(settings, { changes, ip });
    // A smaller limit takes effect now and not at the next daily sweep.
    this.database.pruneByRetention();
    if (relayNodes !== undefined) this.database.replaceRelayNodes(relayNodes);
  }

  getAccessMode(): AccessMode {
    return this.database.getSettings().accessMode;
  }

  listServers(): ServerView[] {
    return this.servers.list();
  }

  createServer(input: ServerInput, ip?: string): ServerView {
    return this.servers.create(input, ip);
  }

  updateServer(id: string, input: ServerInput, ip?: string): ServerView {
    return this.servers.update(id, input, ip);
  }

  reorderServers(ids: unknown, ip?: string): void {
    this.servers.reorder(ids, ip);
  }

  removeServer(id: string, ip?: string): void {
    this.servers.remove(id, this.getAccessMode(), ip);
  }

  /** The configured server a visitor picked, null when it is gone. */
  resolveServer(id: string): ResolvedServer | null {
    return this.servers.resolve(id);
  }

  /**
   * Checks the voice port with the first handshake packets (no client, so nothing shows in a channel and no password
   * check) and pings the host next to it. A silent or wrong port gives ok: false with the reason in errorCode.
   * The result is kept only when the test belongs to a saved server.
   */
  async testConnection(targetText: string, serverId?: string): Promise<ConnectionTestResult> {
    let target: TeamSpeakTarget;
    try {
      target = parseTeamSpeakTarget(targetText);
    } catch {
      throw new AdminInputError("INVALID_TARGET", "TeamSpeak target is invalid");
    }
    let handshake: { latencyMs: number } | { error: TeamSpeakProbeError };
    let ping: TeamSpeakPingResult;
    try {
      [handshake, ping] = await Promise.all([
        this.probe(target).catch((error: unknown) => {
          if (error instanceof TeamSpeakProbeError) return { error };
          throw error;
        }),
        this.hostPing(target.host),
      ]);
    } catch (error: unknown) {
      const unexpected = new TeamSpeakProbeError("INTERNAL_ERROR", "Connection test failed", error);
      this.recordConnectionTest(serverId, null, unexpected.code, {});
      throw unexpected;
    }
    const hostPing = {
      ok: ping.ok,
      latencyMs: ping.latencyMs,
      packetLossPercent: ping.packetLossPercent,
      attempts: ping.attempts,
      successfulAttempts: ping.successfulAttempts,
      ...(ping.errorCode ? { errorCode: ping.errorCode } : {}),
    };
    const details = { hostPingOk: ping.ok, packetLossPercent: ping.packetLossPercent };
    if ("error" in handshake) {
      this.recordConnectionTest(serverId, null, handshake.error.code, details);
      return { ok: false, latencyMs: null, errorCode: handshake.error.code, hostPing };
    }
    this.recordConnectionTest(serverId, handshake.latencyMs, null, details);
    return { ok: true, latencyMs: handshake.latencyMs, hostPing };
  }

  testServer(id: string): Promise<ConnectionTestResult> {
    const { host, port } = this.servers.target(id);
    return this.testConnection(formatTeamSpeakTarget({ host, port }), id);
  }

  private recordConnectionTest(
    serverId: string | undefined,
    latencyMs: number | null,
    code: string | null,
    details: Record<string, unknown>,
  ): void {
    if (serverId) this.database.recordConnectionTest(serverId, { latencyMs, error: code }, details);
  }

  getOverview(activeSessions: number, peakSessions: number, startedAt: number): AdminOverview {
    return {
      gateway: {
        status: "running",
        version: this.version,
        uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      },
      servers: this.servers.list().map((server) => ({
        id: server.id,
        name: server.name,
        target: server.target,
        status: server.lastTestError ? "unreachable" : server.lastTestAt ? "reachable" : "unknown",
        lastTestAt: server.lastTestAt,
        latencyMs: server.lastTestLatencyMs,
        lastError: server.lastTestError,
      })),
      sessions: { active: activeSessions, peak: peakSessions, limit: MAX_ACTIVE_SESSIONS },
      invites: { active: this.invites.activeCount() },
    };
  }

  createManagedInvite(input: ManagedInviteInput, ip?: string): { invite: ManagedInviteView; token: string } {
    return this.invites.create(input, ip);
  }

  listManagedInvites(query: ManagedInviteQuery): { invites: ManagedInviteView[]; total: number } {
    return this.invites.list(query);
  }

  pruneManagedInvites(): number {
    return this.invites.prune();
  }

  revokeManagedInvite(id: string, ip?: string): boolean {
    return this.invites.revoke(id, ip);
  }

  consumeManagedInvite(token: string, ip?: string): { target: TeamSpeakTarget; serverPassword: string; channel: string } | null {
    return this.invites.consume(token, ip);
  }

  private getRelayNodeViews(): Array<{ id: string; name: string; enabled: boolean; target: string; hasToken: boolean }> {
    return this.database.listRelayNodes().map((node) => ({
      id: node.id,
      name: node.name,
      enabled: node.enabled,
      target: formatTeamSpeakTarget(node),
      hasToken: Boolean(node.tokenEncrypted),
    }));
  }
}
