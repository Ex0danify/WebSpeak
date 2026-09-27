import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startGateway, TEST_ADMIN_PASSWORD, useGateway } from "./gateway.js";
import type { FakeTSClient } from "./fake-ts-client.js";

const gateways = useGateway();

describe("startGateway", () => {
  it("serves the real HTTP app on its own port and stops listening on close", async () => {
    const gateway = await startGateway();
    const health = await gateway.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", version: "9.9.9" });
    await gateway.close();
    await expect(fetch(`${gateway.url}/health`)).rejects.toThrow();
  });

  it("gives each gateway its own port and temporary data directory, and removes the directory on close", async () => {
    const first = await startGateway();
    const second = await startGateway();
    expect(first.url).not.toBe(second.url);
    expect(first.dataDir).not.toBe(second.dataDir);
    expect(existsSync(first.dataDir)).toBe(true);
    await first.close();
    await second.close();
    expect(existsSync(first.dataDir)).toBe(false);
  });

  it("sends same-origin requests, and the join-ticket route rejects the same request without an origin", async () => {
    const gateway = await gateways.start();
    const body = JSON.stringify({ nickname: "tester" });
    const withOrigin = await gateway.request("/api/join-ticket", { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(withOrigin.status).toBe(201);
    const withoutOrigin = await fetch(`${gateway.url}/api/join-ticket`, { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(withoutOrigin.status).toBe(403);
    expect(await withoutOrigin.json()).toMatchObject({ code: "ORIGIN_REJECTED" });
  });
});

describe("admin login", () => {
  it("logs in with the harness password and reaches an admin route with the session cookie and CSRF token", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    expect(admin.mustChangePassword).toBe(false);
    expect(admin.csrfToken).toBeTruthy();
    expect((await admin.get("overview")).status).toBe(200);
    expect((await gateway.request("/api/admin/overview")).status).toBe(401);
  });

  it("leaves the first-run account alone when forcePasswordChange is set, and admin routes then ask for a change", async () => {
    const gateway = await gateways.start({ forcePasswordChange: true });
    await expect(gateway.adminLogin(TEST_ADMIN_PASSWORD)).rejects.toThrow("HTTP 401");
    const admin = await gateway.adminLogin("admin");
    expect(admin.mustChangePassword).toBe(true);
    const overview = await admin.get("overview");
    expect(overview.status).toBe(403);
    expect(await overview.json()).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  });
});

describe("voice sessions through the fake TeamSpeak server", () => {
  it("joins with a ticket: the session talks to the fake and the browser gets the connected state", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    const connected = await socket.waitForMessage("connected");
    expect(connected.members).toMatchObject([{ nickname: "alice" }]);
    const client = gateway.ts.created[0] as FakeTSClient;
    expect(client.options).toMatchObject({ nickname: "alice", target: { host: "ts.test", port: 9987 } });
    expect(client.isConnected()).toBe(true);
  });

  it("consumes a ticket once: a second socket with the same ticket is closed with 4001", async () => {
    const gateway = await gateways.start();
    const ticket = gateway.ticket();
    await (await gateway.openVoice(ticket)).waitForMessage("connected");
    const replay = await gateway.openVoice(ticket);
    expect(await replay.waitForClose()).toEqual({ code: 4001, reason: "Join ticket required" });
    await expect(replay.waitForMessage("connected")).rejects.toThrow(/socket closed/);
  });

  it("shows a second session to the first one as a memberEnter", async () => {
    const gateway = await gateways.start();
    const alice = await gateway.openVoice(gateway.ticket({ nickname: "alice" }));
    await alice.waitForMessage("connected");
    const bob = await gateway.openVoice(gateway.ticket({ nickname: "bob" }));
    await bob.waitForMessage("connected");
    expect(await alice.waitForMessage((m) => m.type === "memberEnter" && m.nickname === "bob")).toMatchObject({ isSelf: false });
  });

  it("turns a scripted member's voice into binary frames on the socket", async () => {
    const gateway = await gateways.start();
    const alice = await gateway.openVoice();
    await alice.waitForMessage("connected");
    const remote = gateway.ts.addMember("remote");
    remote.speak(Buffer.from([1, 2, 3]));
    remote.speak(Buffer.from([4, 5, 6]));
    const frames = await alice.waitForBinaryCount(2);
    expect(frames.map((frame) => [...frame])).toEqual([[4, 0, remote.id, 1, 2, 3], [4, 0, remote.id, 4, 5, 6]]);
  });
});

describe("WsClient waiting", () => {
  it("ignores frames recorded before the mark and times out with a description of what it saw", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    const mark = socket.mark();
    await expect(socket.waitForMessage("connected", { after: mark, timeoutMs: 50 })).rejects.toThrow(/timed out waiting for a frame: \d+ frames, last: \[.*channelList.*\], still open/);
    expect((await socket.waitForMessage("connected")).type).toBe("connected");
  });

  it("wakes up for a frame that arrives later", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    const mark = socket.mark();
    const pending = socket.waitForMessage("memberEnter", { after: mark });
    gateway.ts.addMember("late");
    expect(await pending).toMatchObject({ nickname: "late" });
  });
});

describe("stopping the gateway", () => {
  // F12: cleanupEntry() used to call ws.removeAllListeners(), which also removed the listener with which
  // the WebSocketServer forgets a closed client, so wss.close() never called back while a client was
  // still tracked. The 1 s deadline is only the failure signal; it is not a wait for the result.
  it("F12: stopping the gateway with a live session finishes", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    const outcome = await Promise.race([
      gateway.stop().then(() => "stopped"),
      new Promise((resolve) => setTimeout(() => resolve("still stopping after 1 s"), 1000)),
    ]);
    expect(outcome).toBe("stopped");
  });

  it("F12: stopping the gateway after it ended a session itself finishes", async () => {
    const gateway = await gateways.start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    const admin = await gateway.adminLogin();
    const { sessions } = (await (await admin.get("sessions")).json()) as { sessions: { id: string }[] };
    await admin.post(`sessions/${sessions[0]!.id}/terminate`);
    await socket.waitForClose();
    const outcome = await Promise.race([
      gateway.stop().then(() => "stopped"),
      new Promise((resolve) => setTimeout(() => resolve("still stopping after 1 s"), 1000)),
    ]);
    expect(outcome).toBe("stopped");
  });
});
