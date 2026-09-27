import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsInput, useAdminService } from "../../test/helpers/admin-service.js";
import { TeamSpeakProbeError } from "../server/teamspeak-probe.js";
import { AdminInputError } from "./admin-service.js";

const ctx = useAdminService();

function rejection(action: () => unknown): AdminInputError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminInputError);
    return error as AdminInputError;
  }
  throw new Error("expected the action to throw");
}

describe("testConnection with an injected probe and host ping", () => {
  const ping = { ok: true, latencyMs: 4, packetLossPercent: 0, attempts: 4, successfulAttempts: 4, samples: [4, 4, 4, 4] };
  const hostPing = { ok: true, latencyMs: 4, packetLossPercent: 0, attempts: 4, successfulAttempts: 4 };
  beforeEach(() => {
    ctx.ping.mockResolvedValue(ping);
  });

  it("returns the handshake's round trip with the host ping, and records the result and an audit entry", async () => {
    ctx.probe.mockResolvedValue({ ok: true, latencyMs: 31 });
    const service = ctx.create();
    expect(await service.testConnection("ts.example.org:9988", true)).toEqual({ ok: true, latencyMs: 31, hostPing });
    expect(ctx.probe).toHaveBeenCalledWith({ host: "ts.example.org", port: 9988 });
    expect(ctx.ping).toHaveBeenCalledWith("ts.example.org");
    expect(service.database.getSettings()).toMatchObject({ detectedProtocol: null, lastTestLatencyMs: 31, lastTestError: null });
    expect(service.database.recentAudit()[0]).toMatchObject({ event: "CONNECTION_TEST_SUCCEEDED" });
  });

  it("records nothing when persistResult is false", async () => {
    ctx.probe.mockResolvedValue({ ok: true, latencyMs: 31 });
    const service = ctx.create();
    await service.testConnection("ts.example.org", false);
    expect(service.database.getSettings()).toMatchObject({ lastTestAt: null, lastTestLatencyMs: null });
    expect(service.database.recentAudit()).toEqual([]);
  });

  it("reports a failed handshake as ok false with its code, next to the host ping, and records the code", async () => {
    ctx.probe.mockRejectedValue(new TeamSpeakProbeError("NO_ANSWER", "silent"));
    const service = ctx.create();
    expect(await service.testConnection("ts.example.org", true)).toEqual({ ok: false, latencyMs: null, errorCode: "NO_ANSWER", hostPing });
    expect(service.database.getSettings()).toMatchObject({ lastTestLatencyMs: null, lastTestError: "NO_ANSWER" });
    expect(service.database.recentAudit()[0]).toMatchObject({ event: "CONNECTION_TEST_FAILED" });
  });

  it("does not fail the test because the host ignores ping", async () => {
    ctx.probe.mockResolvedValue({ ok: true, latencyMs: 31 });
    ctx.ping.mockResolvedValue({ ok: false, latencyMs: null, packetLossPercent: 100, attempts: 4, successfulAttempts: 0, samples: [], errorCode: "UNREACHABLE" });
    const result = await ctx.create().testConnection("ts.example.org", true);
    expect(result).toEqual({ ok: true, latencyMs: 31, hostPing: { ok: false, latencyMs: null, packetLossPercent: 100, attempts: 4, successfulAttempts: 0, errorCode: "UNREACHABLE" } });
  });

  it("runs the probe and the ping side by side, so a dead host costs the longer of the two, not their sum", async () => {
    const started: string[] = [];
    ctx.probe.mockImplementation(async () => { started.push("probe"); return new Promise(() => undefined); });
    ctx.ping.mockImplementation(async () => { started.push("ping"); return ping; });
    void ctx.create().testConnection("ts.example.org", false);
    await new Promise((resolve) => setImmediate(resolve));
    expect(started).toEqual(["probe", "ping"]);
  });

  it("wraps an unexpected error as INTERNAL_ERROR with a fixed message and records it", async () => {
    const cause = new Error("socket exploded with details");
    ctx.probe.mockRejectedValue(cause);
    const service = ctx.create();
    const error = await service.testConnection("ts.example.org", true).catch((thrown: unknown) => thrown as TeamSpeakProbeError);
    expect(error).toBeInstanceOf(TeamSpeakProbeError);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", message: "Connection test failed", cause });
    expect(service.database.getSettings()).toMatchObject({ lastTestError: "INTERNAL_ERROR" });
  });

  it("rejects an invalid target before probing or pinging", async () => {
    await expect(ctx.create().testConnection("bad target:::", true)).rejects.toMatchObject({ code: "INVALID_TARGET" });
    expect(ctx.probe).not.toHaveBeenCalled();
    expect(ctx.ping).not.toHaveBeenCalled();
  });
});

describe("overview", () => {
  it("reports the target, session counts, uptime and the recent events", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:10:00.500Z"));
    const service = ctx.create();
    service.updateSettings(settingsInput());
    const overview = service.getOverview(3, 7, Date.parse("2026-01-01T00:00:00Z")) as Record<string, any>;
    expect(overview.gateway).toEqual({ status: "running", version: "9.9.9", uptimeSeconds: 600 });
    expect(overview.sessions).toEqual({ active: 3, peak: 7, limit: 100 });
    expect(overview.teamSpeak).toMatchObject({ target: "ts.example.org:9988", status: "unknown", lastTestAt: null });
    expect(overview.recentEvents[0]).toMatchObject({ event: "SETTINGS_CHANGED" });
  });

  it("never reports a negative uptime", () => {
    expect((ctx.create().getOverview(0, 0, Date.now() + 60_000).gateway as { uptimeSeconds: number }).uptimeSeconds).toBe(0);
  });

  it("derives the TeamSpeak status from the last connection test", () => {
    const service = ctx.create();
    const status = () => (service.getOverview(0, 0, 0).teamSpeak as { status: string }).status;
    expect(status()).toBe("unknown");
    service.database.recordConnectionTest({ protocol: null, latencyMs: 20, error: null });
    expect(status()).toBe("reachable");
    service.database.recordConnectionTest({ protocol: null, latencyMs: null, error: "TIMEOUT" });
    expect(status()).toBe("unreachable");
  });
});

describe("managed invites", () => {
  const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

  it("creates an invite with a random URL-safe token, storing only its hash", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const service = ctx.create();
    service.updateSettings(settingsInput({ serverPassword: "pw-1" }));
    const { invite, token } = service.createManagedInvite({ channel: "  Lobby  ", expiresInHours: 2, maxUses: 3 });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invite).toMatchObject({ target: "ts.example.org:9988", channel: "Lobby", maxUses: 3, useCount: 0, status: "active", expiresAt: "2026-01-01T02:00:00.000Z", revokedAt: null });
    expect(invite.id).toMatch(/^invite-[a-z0-9]+-[0-9a-f]{8}$/);
    const raw = new DatabaseSync(ctx.database.path);
    try {
      const row = raw.prepare("SELECT * FROM managed_invites").get() as Record<string, string>;
      expect(row.token_hash).toBe(sha256(token));
      expect(JSON.stringify(row)).not.toContain(token);
      expect(row.server_password_encrypted).toBe(service.database.getSettings().tsPasswordEncrypted);
    } finally {
      raw.close();
    }
    expect(service.database.recentAudit()[0]?.event).toBe("INVITE_CREATED");
    expect(ctx.create().createManagedInvite({ channel: "", expiresInHours: 1, maxUses: 0 }).token).not.toBe(token);
  });

  it.each([
    ["a channel over 100 characters", { channel: "x".repeat(101), expiresInHours: 1, maxUses: 1 }, "INVALID_INVITE_CHANNEL"],
    ["an expiry of 0.5 hours", { channel: "", expiresInHours: 0.5, maxUses: 1 }, "INVALID_INVITE_EXPIRY"],
    ["an expiry over 720 hours", { channel: "", expiresInHours: 721, maxUses: 1 }, "INVALID_INVITE_EXPIRY"],
    ["an expiry of NaN", { channel: "", expiresInHours: Number.NaN, maxUses: 1 }, "INVALID_INVITE_EXPIRY"],
    ["a fractional use count", { channel: "", expiresInHours: 1, maxUses: 1.5 }, "INVALID_INVITE_USES"],
    ["a negative use count", { channel: "", expiresInHours: 1, maxUses: -1 }, "INVALID_INVITE_USES"],
    ["more than 10000 uses", { channel: "", expiresInHours: 1, maxUses: 10001 }, "INVALID_INVITE_USES"],
  ])("rejects %s and stores nothing", (_name, input, code) => {
    const service = ctx.create();
    expect(rejection(() => service.createManagedInvite(input)).code).toBe(code);
    expect(service.listManagedInvites()).toEqual([]);
  });

  it("accepts the limits: 100 character channel, 1 and 720 hours, 0 and 10000 uses", () => {
    const service = ctx.create();
    service.createManagedInvite({ channel: "x".repeat(100), expiresInHours: 1, maxUses: 0 });
    service.createManagedInvite({ channel: "", expiresInHours: 720, maxUses: 10000 });
    expect(service.listManagedInvites()).toHaveLength(2);
  });

  it("consumes a token once: target, decrypted password and channel come back, the use is counted and audited", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ serverPassword: "pw-1" }));
    const { token } = service.createManagedInvite({ channel: "Lobby", expiresInHours: 1, maxUses: 1 });
    expect(service.consumeManagedInvite(token)).toEqual({ target: { host: "ts.example.org", port: 9988 }, serverPassword: "pw-1", channel: "Lobby" });
    expect(service.listManagedInvites()[0]).toMatchObject({ useCount: 1, status: "exhausted" });
    expect(service.database.recentAudit()[0]?.event).toBe("INVITE_CONSUMED");
    expect(service.consumeManagedInvite(token)).toBeNull();
  });

  it("keeps the target and password of the moment the invite was created", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ serverPassword: "pw-1" }));
    const { token } = service.createManagedInvite({ channel: "", expiresInHours: 1, maxUses: 0 });
    service.updateSettings(settingsInput({ target: "moved.example.org:1", passwordAction: "remove" }));
    expect(service.consumeManagedInvite(token)).toMatchObject({ target: { host: "ts.example.org", port: 9988 }, serverPassword: "pw-1" });
  });

  it("refuses tokens with the wrong shape without touching the invites", () => {
    const service = ctx.create();
    const { token } = service.createManagedInvite({ channel: "", expiresInHours: 1, maxUses: 0 });
    for (const bad of ["", "short", `${token}!`, "x".repeat(129), " ".repeat(40)]) expect(service.consumeManagedInvite(bad), JSON.stringify(bad)).toBeNull();
    expect(service.listManagedInvites()[0]?.useCount).toBe(0);
  });

  it("refuses an unknown token of the right shape", () => {
    expect(ctx.create().consumeManagedInvite("A".repeat(43))).toBeNull();
  });

  it("shows the status with the precedence revoked, expired, exhausted, active", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const service = ctx.create();
    const create = (maxUses: number) => service.createManagedInvite({ channel: "", expiresInHours: 1, maxUses });
    const active = create(0);
    const exhausted = create(1);
    const revoked = create(0);
    service.consumeManagedInvite(exhausted.token);
    service.revokeManagedInvite(revoked.invite.id);
    const statuses = () => Object.fromEntries(service.listManagedInvites().map((entry) => [entry.id, entry.status]));
    expect(statuses()).toEqual({ [active.invite.id]: "active", [exhausted.invite.id]: "exhausted", [revoked.invite.id]: "revoked" });
    vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
    expect(statuses()).toEqual({ [active.invite.id]: "expired", [exhausted.invite.id]: "expired", [revoked.invite.id]: "revoked" });
    expect(service.consumeManagedInvite(active.token)).toBeNull();
  });

  it("revokes once, audits only a real revoke, and refuses ids of the wrong shape", () => {
    const service = ctx.create();
    const { invite, token } = service.createManagedInvite({ channel: "", expiresInHours: 1, maxUses: 0 });
    expect(service.revokeManagedInvite(invite.id)).toBe(true);
    expect(service.revokeManagedInvite(invite.id)).toBe(false);
    expect(service.revokeManagedInvite("invite-unknown")).toBe(false);
    expect(service.database.recentAudit(50).filter((entry) => entry.event === "INVITE_REVOKED")).toHaveLength(1);
    expect(service.consumeManagedInvite(token)).toBeNull();
    for (const bad of ["", "invite-", "x", "relay-abc", `invite-${"a".repeat(100)}`, "invite-a b", "invite-a'; DROP TABLE"]) {
      expect(rejection(() => service.revokeManagedInvite(bad)).code, JSON.stringify(bad)).toBe("INVALID_INVITE_ID");
    }
  });

  it("still returns the invite with an empty password when its stored password cannot be decrypted (current behavior)", () => {
    const creator = ctx.create();
    creator.updateSettings(settingsInput({ serverPassword: "pw-1" }));
    const { token } = creator.createManagedInvite({ channel: "Lobby", expiresInHours: 1, maxUses: 0 });
    const other = ctx.create(Buffer.alloc(32, 9));
    expect(other.consumeManagedInvite(token)).toMatchObject({ serverPassword: "", channel: "Lobby" });
    expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ctx.logger.error.mock.calls)).not.toContain("pw-1");
  });
});
