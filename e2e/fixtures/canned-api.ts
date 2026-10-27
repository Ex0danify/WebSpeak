import type { Page } from "@playwright/test";

// Canned /api responses for the visual and accessibility tests, so the guest page and the authenticated admin screens render
// without a gateway that has real data. Times are fixed and the page runs in UTC, so shots are deterministic.

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 15, 12, 0) - minutes * 60_000).toISOString();

const overview = {
  gateway: { version: "0.0.0-snapshot", uptimeSeconds: 93_784 },
  servers: [
    { id: "server-main", name: "Main server", target: "ts.example.com:9987", status: "reachable", lastTestAt: at(12), latencyMs: 32 },
    { id: "server-lan", name: "LAN party", target: "192.168.1.20:9987", status: "unreachable", lastTestAt: at(12), latencyMs: null },
  ],
  sessions: { active: 3, peak: 7, limit: 100 },
  invites: { active: 1 },
};

const servers = {
  servers: [
    {
      id: "server-main",
      name: "Main server",
      target: "ts.example.com:9987",
      hasPassword: true,
      lastTestAt: at(12),
      lastTestLatencyMs: 32,
      lastTestError: null,
    },
    {
      id: "server-lan",
      name: "LAN party",
      target: "192.168.1.20:9987",
      hasPassword: false,
      lastTestAt: at(12),
      lastTestLatencyMs: null,
      lastTestError: "TIMEOUT",
    },
  ],
};

const server = {
  ...servers,
  accessMode: "fixed",
  siteName: "WebSpeak",
  welcomeTexts: { en: "Welcome to WebSpeak", de: "Willkommen bei WebSpeak" },
  webRtcEnabled: true,
  webRtcUdpStart: 40000,
  webRtcUdpEnd: 40099,
  eventLogRetentionDays: 90,
  eventLogMaxRows: 5000,
  connectionRetentionDays: 30,
  connectionMaxRows: 10000,
  relayNodes: [
    { id: "fra", name: "Frankfurt relay", enabled: true, target: "relay.example.com:9987", hasToken: true },
    { id: "tyo", name: "Tokyo relay", enabled: false, target: "tokyo.example.com:9987", hasToken: false },
  ],
};

const sessions = {
  sessions: [
    {
      id: "s1",
      nickname: "Alex Rivera",
      target: "ts.example.com:9987",
      state: "connected",
      createdAt: at(12),
      ageSeconds: 734,
      tsClientId: 12,
      channelId: "2",
      memberCount: 4,
    },
    {
      id: "s2",
      nickname: "Mira Tanaka",
      target: "ts.example.com:9987",
      state: "connected",
      createdAt: at(47),
      ageSeconds: 2820,
      tsClientId: 13,
      channelId: "2",
      memberCount: 4,
    },
  ],
};

const invites = {
  invites: [
    {
      id: "i1",
      target: "ts.example.com:9987",
      channel: "Raid Night",
      expiresAt: at(-1440),
      maxUses: 5,
      useCount: 2,
      createdAt: at(38),
      revokedAt: null,
      status: "active",
    },
    {
      id: "i2",
      target: "ts.example.com:9987",
      channel: "Lobby",
      expiresAt: at(600),
      maxUses: 1,
      useCount: 1,
      createdAt: at(2000),
      revokedAt: null,
      status: "exhausted",
    },
    {
      id: "i3",
      target: "ts.example.com:9987",
      channel: "Strategy",
      expiresAt: at(-60),
      maxUses: 3,
      useCount: 0,
      createdAt: at(300),
      revokedAt: at(120),
      status: "revoked",
    },
  ],
  total: 3,
};

const diagnostics = {
  gateway: { version: "0.0.0-snapshot", node: "v22.11.0", platform: "linux", arch: "x64" },
  database: { schemaVersion: 7 },
  sessions: { created: 128 },
};

const connections = {
  records: [
    {
      id: "c1",
      nickname: "Alex Rivera",
      clientIp: "203.0.113.24",
      target: "ts.example.com:9987",
      relayName: "Frankfurt relay",
      relayTarget: "relay.example.com:9987",
      startedAt: at(12),
      connectedAt: at(12),
      disconnectedAt: null,
      durationSeconds: 734,
      status: "active",
      reason: null,
      failureDetail: null,
      audio: { talkSeconds: 212, framesSent: 10600, framesReceived: 36700, droppedFrames: 0, sendErrors: 0 },
    },
    {
      id: "c2",
      nickname: "Kenji Sato",
      clientIp: "198.51.100.7",
      target: "ts.example.com:9987",
      relayName: null,
      relayTarget: null,
      startedAt: at(95),
      connectedAt: at(95),
      disconnectedAt: at(70),
      durationSeconds: 1500,
      status: "disconnected",
      reason: null,
      failureDetail: null,
      audio: { talkSeconds: 640, framesSent: 32000, framesReceived: 90100, droppedFrames: 14, sendErrors: 1 },
    },
    {
      id: "c3",
      nickname: "Guest 41",
      clientIp: "192.0.2.90",
      target: "ts.example.com:9987",
      relayName: null,
      relayTarget: null,
      startedAt: at(140),
      connectedAt: null,
      disconnectedAt: at(140),
      durationSeconds: null,
      status: "failed",
      reason: "TIMEOUT",
      failureDetail: "TeamSpeak did not answer within 10 s",
      audio: null,
    },
  ],
  total: 3,
};

const audit = {
  events: [
    {
      id: 5,
      event: "ADMIN_LOGIN_FAILED",
      category: "auth",
      severity: "warning",
      details: { username: "root", ip: "203.0.113.7" },
      createdAt: at(2),
    },
    {
      id: 4,
      event: "INVITE_CREATED",
      category: "invites",
      severity: "info",
      details: { serverName: "Main server", channel: "Lobby", maxUses: 5, expiresAt: at(-1440), ip: "198.51.100.4" },
      createdAt: at(38),
    },
    {
      id: 3,
      event: "SERVER_UPDATED",
      category: "config",
      severity: "info",
      details: {
        name: "Main server",
        target: "ts.example.com:9987",
        changes: [{ field: "name", from: "Main", to: "Main server" }, { field: "password" }],
        ip: "198.51.100.4",
      },
      createdAt: at(190),
    },
    { id: 2, event: "ADMIN_LOGIN_SUCCEEDED", category: "auth", severity: "info", details: {}, createdAt: at(200) },
    { id: 1, event: "ADMIN_INITIALIZED", category: "system", severity: "info", details: {}, createdAt: at(1440) },
  ],
  total: 5,
};

export const publicConfig = {
  version: "0.0.0-snapshot",
  initialized: true,
  siteName: "WebSpeak",
  welcomeTexts: {
    en: "Welcome to WebSpeak",
    de: "Willkommen bei WebSpeak",
  },
  accessMode: "fixed",
  servers: [
    { id: "server-main", name: "Main server" },
    { id: "server-lan", name: "LAN party" },
  ],
  visitorNumber: 1234,
  visitorTotal: 5678,
  accelerationAvailable: false,
  accelerationRelays: [],
};

export interface Screen {
  id: string;
  path: string;
  langs: string[];
  admin?: boolean;
}

export const adminScreens: Screen[] = [
  { id: "admin-dashboard", path: "/admin", langs: ["en", "de"], admin: true },
  { id: "admin-gateway", path: "/admin/gateway", langs: ["en", "de"], admin: true },
  { id: "admin-web", path: "/admin/web", langs: ["en", "de"], admin: true },
  { id: "admin-users", path: "/admin/users", langs: ["en", "de"], admin: true },
  { id: "admin-users-invites", path: "/admin/users/invites", langs: ["en", "de"], admin: true },
  { id: "admin-users-sessions", path: "/admin/users/sessions", langs: ["en", "de"], admin: true },
  { id: "admin-diagnostics", path: "/admin/diagnostics", langs: ["en", "de"], admin: true },
  { id: "admin-diagnostics-events", path: "/admin/diagnostics/events", langs: ["en", "de"], admin: true },
];

// Returns [status, body] for an authenticated admin request, or null when not mocked.
export function adminApi(pathname: string): [number, unknown] | null {
  if (pathname === "/api/admin/session") return [200, { authenticated: true, mustChangePassword: false, csrfToken: "snapshot-csrf" }];
  if (pathname === "/api/admin/overview") return [200, overview];
  if (pathname === "/api/admin/server") return [200, server];
  if (pathname === "/api/admin/servers") return [200, servers];
  // The probes of the server list: the first answers, the second stays silent.
  if (pathname === "/api/admin/servers/server-main/test") return [200, { ok: true, latencyMs: 32 }];
  if (pathname === "/api/admin/servers/server-lan/test") return [200, { ok: false, latencyMs: null, errorCode: "TIMEOUT" }];
  if (pathname === "/api/admin/sessions") return [200, sessions];
  if (pathname === "/api/admin/invites") return [200, invites];
  if (pathname === "/api/admin/diagnostics") return [200, diagnostics];
  if (pathname === "/api/admin/connections") return [200, connections];
  if (pathname === "/api/admin/audit") return [200, audit];
  return null;
}

/**
 * Before the first navigation: the language and theme the page starts in, and the canned `/api`
 * answers (`admin` adds the signed-in console's). Whatever else asks for `/api` gets a 404.
 */
export async function useCannedApi(page: Page, { lang, theme, admin }: { lang: string; theme: string; admin?: boolean }): Promise<void> {
  await page.addInitScript(
    ({ language, themeMode }) => {
      try {
        localStorage.setItem("webspeak:language", language);
        localStorage.setItem("webspeak:theme", themeMode);
      } catch {
        // storage unavailable
      }
    },
    { language: lang, themeMode: theme },
  );
  await page.context().route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    // The Join page polls this; without it the gateway status sits offline and its retry countdown ticks under the screenshot.
    if (pathname === "/api/health") return json(200, { status: "ok", version: "0.0.0-test" });
    if (pathname === "/api/public-config") return json(200, publicConfig);
    const authenticated = admin ? adminApi(pathname) : null;
    if (authenticated) return json(authenticated[0], authenticated[1]);
    if (pathname === "/api/admin/session") return json(200, { authenticated: false });
    return json(404, { error: "NOT_MOCKED" });
  });
}
