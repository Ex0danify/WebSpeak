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
import { AdminInviteService, type ManagedInviteInput, type ManagedInviteView } from "./adminInviteService.js";
import { AdminBootstrapError, type AdminBootstrap } from "./adminBootstrap.js";
import {
  legacyRelayNodesFromSettings,
  normalizeRelayNodes,
  normalizeSettings,
  toSettingsUpdate,
  type AdminSettingsInput,
} from "./adminSettingsNormalizer.js";

export { AdminInputError };
export type { ManagedInviteInput, ManagedInviteView } from "./adminInviteService.js";
export type { AdminSettingsInput, RelayNodeInput } from "./adminSettingsNormalizer.js";

export interface ConnectionPolicy {
  defaultTarget: TeamSpeakTarget;
  serverPassword: string;
  accessMode: AccessMode;
}

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

export class AdminService {
  private readonly invites: AdminInviteService;

  constructor(
    readonly database: WebSpeakDatabase,
    private readonly masterSecret: Buffer,
    private readonly logger: Logger,
    /** The port the gateway listens on, shown in the console. */
    private readonly port: number,
    private readonly probe: ProbeFunction = probeTeamSpeak,
    private readonly version = "0.1.0",
    private readonly hostPing: HostPingFunction = (host) => pingTeamSpeakHost(host, { attempts: 4 }),
  ) {
    this.invites = new AdminInviteService(database, masterSecret, logger);
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

  async changePassword(password: string): Promise<void> {
    const credential = this.database.getAdminCredential();
    if (!credential) throw new AdminInputError("NOT_INITIALIZED", "The administrator account is not initialized");
    const passwordError = validateAdminPassword(password);
    if (passwordError) throw new AdminInputError("INVALID_ADMIN_PASSWORD", passwordError);
    const replacement = await hashAdminPassword(password, { username: credential.username, mustChangePassword: false });
    this.database.updateAdminCredential(replacement);
    this.database.addAudit("ADMIN_PASSWORD_CHANGED");
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
      target: formatTeamSpeakTarget({ host: settings.tsHost, port: settings.tsPort }),
    };
  }

  getAdminSettings(): Record<string, unknown> {
    const settings = this.database.getSettings();
    return {
      target: formatTeamSpeakTarget({ host: settings.tsHost, port: settings.tsPort }),
      hasPassword: Boolean(settings.tsPasswordEncrypted),
      accessMode: settings.accessMode,
      siteName: settings.siteName,
      welcomeTexts: settings.welcomeTexts,
      welcomeDefaults: DEFAULT_WELCOME_TEXTS,
      lastTestAt: settings.lastTestAt,
      lastTestLatencyMs: settings.lastTestLatencyMs,
      lastTestError: settings.lastTestError,
      webRtcEnabled: settings.webRtcEnabled,
      webRtcUdpStart: settings.webRtcUdpStart,
      webRtcUdpEnd: settings.webRtcUdpEnd,
      identityMintMaxLevel: settings.identityMintMaxLevel,
      identityMintConcurrency: settings.identityMintConcurrency,
      identityMintQueueDepth: settings.identityMintQueueDepth,
      relayConfigured: settings.relayConfigured,
      relayEnabled: settings.relayEnabled,
      relayName: settings.relayName,
      relayTarget: settings.relayHost ? formatRelayTarget(settings.relayHost, settings.relayPort) : "",
      hasRelayToken: Boolean(settings.relayTokenEncrypted),
      relayNodes: this.getRelayNodeViews(),
      internalPort: this.port,
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

  updateSettings(input: AdminSettingsInput): void {
    const current = this.database.getSettings();
    const relayNodes =
      input.relayNodes === undefined ? undefined : normalizeRelayNodes(input.relayNodes, this.database.listRelayNodes(), this.masterSecret);
    const settings = normalizeSettings(input, current, this.masterSecret, relayNodes);
    const targetChanged = current.tsHost !== settings.tsHost || current.tsPort !== settings.tsPort;
    this.database.updateSettings(settings);
    if (relayNodes !== undefined) {
      this.database.replaceRelayNodes(relayNodes);
    } else if (input.relaySettingsAction && input.relaySettingsAction !== "keep") {
      this.database.replaceRelayNodes(legacyRelayNodesFromSettings(settings, this.database.listRelayNodes()));
    }
    if (targetChanged) this.database.clearConnectionTest();
  }

  getConnectionPolicy(): ConnectionPolicy {
    const settings = this.database.getSettings();
    let serverPassword = "";
    try {
      serverPassword = decryptSecret(settings.tsPasswordEncrypted, this.masterSecret);
    } catch (error: unknown) {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "Stored TeamSpeak password could not be decrypted",
      );
    }
    return {
      defaultTarget: { host: settings.tsHost, port: settings.tsPort },
      serverPassword,
      accessMode: settings.accessMode,
    };
  }

  /**
   * Checks the voice port with the first handshake packets (no client, so nothing shows in a channel and no password
   * check) and pings the host next to it. A silent or wrong port gives ok: false with the reason in errorCode.
   */
  async testConnection(targetText: string, persistResult: boolean): Promise<ConnectionTestResult> {
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
      this.recordConnectionTest(persistResult, null, unexpected.code, {});
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
      this.recordConnectionTest(persistResult, null, handshake.error.code, details);
      return { ok: false, latencyMs: null, errorCode: handshake.error.code, hostPing };
    }
    this.recordConnectionTest(persistResult, handshake.latencyMs, null, details);
    return { ok: true, latencyMs: handshake.latencyMs, hostPing };
  }

  private recordConnectionTest(
    persistResult: boolean,
    latencyMs: number | null,
    code: string | null,
    details: Record<string, unknown>,
  ): void {
    if (!persistResult) return;
    this.database.recordConnectionTest({ protocol: null, latencyMs, error: code });
    this.database.addAudit(code ? "CONNECTION_TEST_FAILED" : "CONNECTION_TEST_SUCCEEDED", {
      ...(latencyMs === null ? {} : { latencyMs }),
      ...(code ? { code } : {}),
      ...details,
    });
  }

  getOverview(activeSessions: number, peakSessions: number, startedAt: number): Record<string, unknown> {
    const settings = this.database.getSettings();
    return {
      gateway: {
        status: "running",
        version: this.version,
        uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      },
      teamSpeak: {
        target: formatTeamSpeakTarget({ host: settings.tsHost, port: settings.tsPort }),
        status: settings.lastTestError ? "unreachable" : settings.lastTestAt ? "reachable" : "unknown",
        lastTestAt: settings.lastTestAt,
        latencyMs: settings.lastTestLatencyMs,
        lastError: settings.lastTestError,
      },
      sessions: { active: activeSessions, peak: peakSessions, limit: 100 },
      recentEvents: this.database.recentAudit(),
    };
  }

  createManagedInvite(input: ManagedInviteInput): { invite: ManagedInviteView; token: string } {
    return this.invites.create(input);
  }

  listManagedInvites(): ManagedInviteView[] {
    return this.invites.list();
  }

  revokeManagedInvite(id: string): boolean {
    return this.invites.revoke(id);
  }

  consumeManagedInvite(token: string): { target: TeamSpeakTarget; serverPassword: string; channel: string } | null {
    return this.invites.consume(token);
  }

  private getRelayNodeViews(): Array<{ id: string; name: string; enabled: boolean; target: string; hasToken: boolean }> {
    return this.database.listRelayNodes().map((node) => ({
      id: node.id,
      name: node.name,
      enabled: node.enabled,
      target: formatRelayTarget(node.host, node.port),
      hasToken: Boolean(node.tokenEncrypted),
    }));
  }
}

function formatRelayTarget(host: string, port: number): string {
  return `${host.includes(":") ? `[${host}]` : host}#${port}`;
}
