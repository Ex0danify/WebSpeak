import { createHash, randomBytes } from "node:crypto";
import type { Logger } from "../../shared/logger.js";
import { formatTeamSpeakTarget, type TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import { type ManagedInviteRecord, WebSpeakDatabase } from "../../infra/persistence/database.js";
import { decryptSecret } from "../../infra/security/secretCrypto.js";
import { AdminInputError } from "./adminErrors.js";

export interface ManagedInviteInput {
  channel: string;
  expiresInHours: number;
  maxUses: number;
}

export interface ManagedInviteView {
  id: string;
  target: string;
  channel: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  revokedAt: string | null;
  status: "active" | "expired" | "exhausted" | "revoked";
}

export class AdminInviteService {
  constructor(
    private readonly database: WebSpeakDatabase,
    private readonly masterSecret: Buffer,
    private readonly logger: Logger,
  ) {}

  create(input: ManagedInviteInput): { invite: ManagedInviteView; token: string } {
    const channel = input.channel.trim();
    if (channel.length > 100) throw new AdminInputError("INVALID_INVITE_CHANNEL", "Invite channel cannot exceed 100 characters");
    if (!Number.isFinite(input.expiresInHours) || input.expiresInHours < 1 || input.expiresInHours > 720) {
      throw new AdminInputError("INVALID_INVITE_EXPIRY", "Invite expiry must be between 1 and 720 hours");
    }
    if (!Number.isInteger(input.maxUses) || input.maxUses < 0 || input.maxUses > 10000) {
      throw new AdminInputError("INVALID_INVITE_USES", "Invite max uses must be between 0 and 10000");
    }
    const settings = this.database.getSettings();
    const token = randomBytes(32).toString("base64url");
    const record = this.database.createManagedInvite({
      id: `invite-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
      tokenHash: hashInviteToken(token),
      targetHost: settings.tsHost,
      targetPort: settings.tsPort,
      serverPasswordEncrypted: settings.tsPasswordEncrypted,
      channel,
      expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString(),
      maxUses: input.maxUses,
    });
    this.database.addAudit("INVITE_CREATED", { id: record.id, channel, maxUses: input.maxUses });
    return { invite: toInviteView(record), token };
  }

  list(): ManagedInviteView[] {
    return this.database.listManagedInvites().map(toInviteView);
  }

  revoke(id: string): boolean {
    if (!/^invite-[a-z0-9-]+$/i.test(id) || id.length > 100) throw new AdminInputError("INVALID_INVITE_ID", "Invite id is invalid");
    const revoked = this.database.revokeManagedInvite(id);
    if (revoked) this.database.addAudit("INVITE_REVOKED", { id });
    return revoked;
  }

  consume(token: string): { target: TeamSpeakTarget; serverPassword: string; channel: string } | null {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
    const record = this.database.consumeManagedInvite(hashInviteToken(token));
    if (!record) return null;
    let serverPassword = "";
    try {
      serverPassword = decryptSecret(record.serverPasswordEncrypted, this.masterSecret);
    } catch (error: unknown) {
      this.logger.error({ err: error instanceof Error ? error.message : String(error), inviteId: record.id }, "Managed invite password could not be decrypted");
    }
    this.database.addAudit("INVITE_CONSUMED", { id: record.id });
    return { target: { host: record.targetHost, port: record.targetPort }, serverPassword, channel: record.channel };
  }
}

export function toInviteView(record: ManagedInviteRecord): ManagedInviteView {
  const now = Date.now();
  const expired = Date.parse(record.expiresAt) <= now;
  const exhausted = record.maxUses > 0 && record.useCount >= record.maxUses;
  return {
    id: record.id,
    target: formatTeamSpeakTarget({ host: record.targetHost, port: record.targetPort }),
    channel: record.channel,
    expiresAt: record.expiresAt,
    maxUses: record.maxUses,
    useCount: record.useCount,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
    status: record.revokedAt ? "revoked" : expired ? "expired" : exhausted ? "exhausted" : "active",
  };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
