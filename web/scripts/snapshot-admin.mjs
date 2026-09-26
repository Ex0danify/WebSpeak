// Canned /api/admin/** responses for the snapshot harness, so the authenticated admin
// screens (overview, server settings, operations) render without a gateway.
// Times are fixed, and the page runs in UTC, so shots are deterministic.

const at = (minutes) => new Date(Date.UTC(2026, 0, 15, 12, 0) - minutes * 60_000).toISOString();

const overview = {
  gateway: { version: "0.0.0-snapshot", uptimeSeconds: 93_784 },
  teamSpeak: { target: "ts.example.com:9987", status: "ok", lastTestAt: at(12), latencyMs: 32 },
  sessions: { active: 3, peak: 7, limit: 100 },
  recentEvents: [
    { event: "session.created", createdAt: at(4) },
    { event: "invite.created", createdAt: at(38) },
    { event: "server.updated", createdAt: at(190) },
  ],
  legacyConfigImported: true,
};

const server = {
  target: "ts.example.com:9987",
  hasPassword: true,
  accessMode: "fixed",
  siteName: "WebSpeak",
  welcomeText: "欢迎来到 WebSpeak",
  welcomeTextEn: "Welcome to WebSpeak",
  webRtcEnabled: true,
  webRtcUdpStart: 40000,
  webRtcUdpEnd: 40099,
  relayConfigured: true,
  relayEnabled: true,
  relayName: "Frankfurt relay",
  relayTarget: "relay.example.com:9987",
  hasRelayToken: true,
  relayNodes: [
    { id: "fra", name: "Frankfurt relay", enabled: true, target: "relay.example.com:9987", hasToken: true },
    { id: "tyo", name: "Tokyo relay", enabled: false, target: "tokyo.example.com:9987", hasToken: false },
  ],
  lastTestAt: at(12),
  lastTestLatencyMs: 32,
};

const sessions = {
  sessions: [
    { id: "s1", nickname: "Alex Rivera", target: "ts.example.com:9987", state: "connected", createdAt: at(12), ageSeconds: 734, tsClientId: 12, channelId: "2", memberCount: 4 },
    { id: "s2", nickname: "Mira Tanaka", target: "ts.example.com:9987", state: "connected", createdAt: at(47), ageSeconds: 2820, tsClientId: 13, channelId: "2", memberCount: 4 },
  ],
};

const invites = {
  invites: [
    { id: "i1", target: "ts.example.com:9987", channel: "Raid Night", expiresAt: at(-1440), maxUses: 5, useCount: 2, createdAt: at(38), revokedAt: null, status: "active" },
    { id: "i2", target: "ts.example.com:9987", channel: "Lobby", expiresAt: at(600), maxUses: 1, useCount: 1, createdAt: at(2000), revokedAt: null, status: "exhausted" },
    { id: "i3", target: "ts.example.com:9987", channel: "Strategy", expiresAt: at(-60), maxUses: 3, useCount: 0, createdAt: at(300), revokedAt: at(120), status: "revoked" },
  ],
};

const diagnostics = {
  gateway: { version: "0.0.0-snapshot", node: "v22.11.0", platform: "linux", arch: "x64" },
  database: { schemaVersion: 7 },
  sessions: { created: 128 },
};

const logs = {
  available: true,
  entries: [
    { timestamp: at(3), level: "info", message: "Browser session connected", context: { nickname: "Alex Rivera" } },
    { timestamp: at(9), level: "warn", message: "Reconnect attempt failed", context: { attempt: 2 } },
    { timestamp: at(21), level: "error", message: "TeamSpeak handshake timed out", context: { target: "ts.example.com:9987" } },
  ],
  sessions: [
    { id: "c1", nickname: "Alex Rivera", clientIp: "203.0.113.24", target: "ts.example.com:9987", relayName: "Frankfurt relay", relayTarget: "relay.example.com:9987", startedAt: at(12), connectedAt: at(12), disconnectedAt: null, durationSeconds: 734, status: "active", reason: null, failureDetail: null },
    { id: "c2", nickname: "Kenji Sato", clientIp: "198.51.100.7", target: "ts.example.com:9987", relayName: null, relayTarget: null, startedAt: at(95), connectedAt: at(95), disconnectedAt: at(70), durationSeconds: 1500, status: "disconnected", reason: "client-left", failureDetail: null },
    { id: "c3", nickname: "Guest 41", clientIp: "192.0.2.90", target: "ts.example.com:9987", relayName: null, relayTarget: null, startedAt: at(140), connectedAt: null, disconnectedAt: at(140), durationSeconds: null, status: "failed", reason: "handshake-timeout", failureDetail: "TeamSpeak did not answer within 10 s" },
  ],
};

const audit = {
  events: [
    { event: "admin.login", createdAt: at(2) },
    { event: "invite.created", createdAt: at(38) },
    { event: "server.updated", createdAt: at(190) },
  ],
};

export const adminScreens = [
  { id: "admin-overview", path: "/admin", langs: ["en", "de"], admin: true },
  { id: "admin-server", path: "/admin/server", langs: ["en"], admin: true },
  { id: "admin-operations", path: "/admin/operations", langs: ["en"], admin: true },
];

// Returns [status, body] for an authenticated admin request, or null when not mocked.
export function adminApi(pathname) {
  if (pathname === "/api/admin/session") return [200, { authenticated: true, mustChangePassword: false, csrfToken: "snapshot-csrf" }];
  if (pathname === "/api/admin/overview") return [200, overview];
  if (pathname === "/api/admin/server") return [200, server];
  if (pathname === "/api/admin/sessions") return [200, sessions];
  if (pathname === "/api/admin/invites") return [200, invites];
  if (pathname === "/api/admin/diagnostics") return [200, diagnostics];
  if (pathname === "/api/admin/logs") return [200, logs];
  if (pathname === "/api/admin/audit") return [200, audit];
  return null;
}
