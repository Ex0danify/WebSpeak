import { describe, expect, it } from "vitest";
import { useI18n } from "@/shared/i18n/useI18n";
import type { AdminEvent } from "@/features/admin/core/adminTypes";
import { createEventText } from "@/features/admin/events/eventText";

function setup(language: "en" | "de" = "en") {
  const i18n = useI18n();
  i18n.setLanguage(language);
  return createEventText(i18n.language, i18n.t);
}

const entry = (event: string, details: Record<string, unknown> = {}): AdminEvent => ({
  id: 1,
  event,
  category: "system",
  severity: "info",
  details,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("createEventText", () => {
  it("names an event in each language and falls back to the event code", () => {
    expect(setup("en").title("ADMIN_LOGIN_FAILED")).toBe("Administrator login failed");
    expect(setup("en").title("INVITE_REVOKED")).toBe("Invite link revoked");
    expect(setup("de").title("INVITE_REVOKED")).toBe("Einladungslink widerrufen");
    expect(setup("en").title("SOME_NEW_EVENT")).toBe("SOME NEW EVENT");
  });

  it("gives every event the gateway writes a name of its own", () => {
    const { title } = setup();
    for (const event of [
      "ADMIN_INITIALIZED",
      "ADMIN_LOGIN_SUCCEEDED",
      "ADMIN_LOGIN_FAILED",
      "ADMIN_LOGOUT",
      "ADMIN_PASSWORD_CHANGED",
      "ADMIN_PASSWORD_RESET",
      "ADMIN_SESSION_TERMINATED",
      "ADMIN_BACKUP_EXPORTED",
      "SETTINGS_CHANGED",
      "SERVER_ADDED",
      "SERVER_UPDATED",
      "SERVER_REMOVED",
      "SERVERS_REORDERED",
      "INVITE_CREATED",
      "INVITE_CONSUMED",
      "INVITE_REVOKED",
      "SERVER_AVAILABLE",
      "SERVER_UNAVAILABLE",
    ]) {
      expect(title(event), event).not.toBe(event.replaceAll("_", " "));
    }
  });

  it("says which server and what happened to it", () => {
    const { detail } = setup();
    expect(detail(entry("SERVER_ADDED", { name: "Main", target: "ts.example.com:9987" })).summary).toBe("Main · ts.example.com:9987");
    expect(detail(entry("SERVER_UPDATED", { name: "Main", target: "ts:1", revokedInvites: 2 })).summary).toBe(
      "Main · ts:1 · 2 invites revoked",
    );
    expect(detail(entry("SERVER_REMOVED", { id: "s", name: "Main", revokedInvites: 0 })).summary).toBe("Main");
    expect(detail(entry("SERVER_REMOVED", { id: "s" })).summary).toBe("");
    expect(detail(entry("SERVER_UNAVAILABLE", { name: "Main", code: "TIMEOUT" })).summary).toBe("Main · Network request timed out");
    expect(detail(entry("SERVER_AVAILABLE", { name: "Main", latencyMs: 31 })).summary).toBe("Main · 31 ms");
    expect(detail(entry("SERVERS_REORDERED", { count: 3 })).summary).toBe("3 servers");
  });

  it("names the channel of an invite, or the default one", () => {
    const { detail } = setup();
    expect(detail(entry("INVITE_CREATED", { serverName: "Main", channel: "Lobby" })).summary).toBe("Main · Lobby");
    expect(detail(entry("INVITE_CREATED", { serverName: "Main", channel: "" })).summary).toBe("Main · Default channel");
    expect(detail(entry("INVITE_CONSUMED", { channel: "Lobby" })).summary).toBe("Lobby");
    expect(detail(entry("INVITE_CONSUMED", {})).summary).toBe("Default channel");
  });

  it("names the user tried at a failed login and the address of the client", () => {
    const { detail } = setup();
    expect(detail(entry("ADMIN_LOGIN_FAILED", { username: "root", ip: "203.0.113.7" })).summary).toBe("User “root” · IP 203.0.113.7");
    expect(detail(entry("ADMIN_LOGOUT", { ip: "::1" })).summary).toBe("IP ::1");
  });

  it("lists what a save changed, one line per field", () => {
    const { detail } = setup();
    const changed = detail(
      entry("SETTINGS_CHANGED", {
        changes: [
          { field: "siteName", from: "WebSpeak", to: "Clan" },
          { field: "accessMode", from: "fixed", to: "open" },
          { field: "webRtcEnabled", from: false, to: true },
          { field: "welcomeTexts" },
          { field: "unknownField", from: 1, to: 2 },
        ],
        ip: "10.0.0.2",
      }),
    );
    expect(changed.summary).toBe("IP 10.0.0.2");
    expect(changed.changes).toEqual([
      "Site display name: WebSpeak → Clan",
      "Server access: Only the configured servers → Also allow other TeamSpeak servers",
      "Enable WebRTC: off → on",
      "Welcome message changed",
    ]);
    expect(detail(entry("SETTINGS_CHANGED", { changes: [] })).summary).toBe("Saved without changes");
    expect(setup("de").detail(entry("SERVER_UPDATED", { name: "A", changes: [{ field: "password" }] })).changes).toEqual([
      "Serverpasswort geändert",
    ]);
  });

  it("says what an invite was made for and how far it was used", () => {
    const { detail } = setup();
    expect(
      detail(entry("INVITE_CREATED", { serverName: "Main", channel: "Lobby", maxUses: 5, expiresAt: "2030-01-01T00:00:00.000Z" })).summary,
    ).toMatch(/^Main · Lobby · Up to 5 uses · Expires /);
    expect(detail(entry("INVITE_CREATED", { serverName: "Main", channel: "", maxUses: 0 })).summary).toBe(
      "Main · Default channel · Unlimited uses",
    );
    expect(detail(entry("INVITE_REVOKED", { serverName: "Main", channel: "Lobby", useCount: 2, maxUses: 5, ip: "1.2.3.4" })).summary).toBe(
      "Main · Lobby · 2 of 5 uses · IP 1.2.3.4",
    );
    expect(detail(entry("ADMIN_SESSION_TERMINATED", { nickname: "Kim", target: "ts:9987" })).summary).toBe("Kim · ts:9987");
  });

  it("has no detail for an event that carries none worth showing", () => {
    const { detail } = setup();
    expect(detail(entry("ADMIN_LOGOUT")).summary).toBe("");
    expect(detail(entry("SOME_NEW_EVENT", { x: 1 })).summary).toBe("");
  });
});
