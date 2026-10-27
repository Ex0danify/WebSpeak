import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER_ID, serverInput, settingsInput } from "../../../test/support/adminService.js";
import { type AdminApi, type Gateway, useGateway } from "../../../test/support/gateway.js";
import { TeamSpeakProbeError } from "../teamspeak/teamSpeakProbe.js";

const gateways = useGateway();

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function start(options?: Parameters<typeof gateways.start>[0]): Promise<{ gateway: Gateway; admin: AdminApi }> {
  const gateway = await gateways.start(options);
  return { gateway, admin: await gateway.adminLogin() };
}

const audit = (gateway: Gateway) => gateway.database.listAudit({ limit: 50, offset: 0 }).events.map((row) => row.event);

describe("the server list", () => {
  const create = (admin: AdminApi, overrides: Record<string, unknown> = {}) => admin.post("servers", { ...serverInput(), ...overrides });

  it("lists the seeded server, with its test result and no ciphertext", async () => {
    const { admin } = await start();
    expect(await json(await admin.get("servers"))).toEqual({
      servers: [
        {
          id: DEFAULT_SERVER_ID,
          name: "WebSpeak",
          target: "127.0.0.1:9987",
          hasPassword: false,
          lastTestAt: null,
          lastTestLatencyMs: null,
          lastTestError: null,
        },
      ],
    });
  });

  it("adds a server and answers with it and the whole list, audited", async () => {
    const { gateway, admin } = await start();
    const response = await create(admin, { serverPassword: "s3cret-pass" });
    const body = await json(response);
    expect(response.status).toBe(201);
    expect(body.server).toMatchObject({ name: "Test server", target: "ts.example.org:9988", hasPassword: true });
    expect(body.servers.map((server: { id: string }) => server.id)).toEqual([DEFAULT_SERVER_ID, body.server.id]);
    expect(JSON.stringify(body)).not.toContain("s3cret");
    expect(audit(gateway)[0]).toBe("SERVER_ADDED");
  });

  it("changes a server and answers with it", async () => {
    const { gateway, admin } = await start();
    const response = await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput({ name: "Renamed" }));
    expect([response.status, (await json(response)).server]).toMatchObject([200, { id: DEFAULT_SERVER_ID, name: "Renamed" }]);
    expect(audit(gateway)[0]).toBe("SERVER_UPDATED");
  });

  it("writes down what an edit changed, and that the password did, without its value", async () => {
    const { gateway, admin } = await start();
    await admin.put(
      `servers/${DEFAULT_SERVER_ID}`,
      serverInput({ name: "Renamed", target: "other.example.org:9987", passwordAction: "replace", serverPassword: "s3cret-pass" }),
    );
    const [updated] = gateway.database.listAudit({ limit: 1, offset: 0 }).events;
    expect(updated?.details).toMatchObject({
      changes: [
        { field: "name", from: "WebSpeak", to: "Renamed" },
        { field: "target", from: "127.0.0.1:9987", to: "other.example.org:9987" },
        { field: "password" },
      ],
      ip: expect.stringMatching(/\S/),
    });
    expect(JSON.stringify(updated)).not.toContain("s3cret");
  });

  it("removes a server when open access does not need it", async () => {
    const { gateway, admin } = await start();
    const created = (await json(await create(admin))).server;
    const response = await admin.delete(`servers/${created.id}`);
    expect([response.status, (await json(response)).servers.map((server: { id: string }) => server.id)]).toEqual([
      200,
      [DEFAULT_SERVER_ID],
    ]);
    expect(audit(gateway)[0]).toBe("SERVER_REMOVED");
  });

  it("answers bad input with 400 and the code of the rule, and changes nothing", async () => {
    const { admin } = await start();
    const cases: [string, Record<string, unknown>, string][] = [
      ["no name", { name: undefined }, "INVALID_REQUEST"],
      ["name over 80 characters", { name: "n".repeat(81) }, "INVALID_REQUEST"],
      ["empty name", { name: " " }, "INVALID_SERVER_NAME"],
      ["no target", { target: undefined }, "INVALID_REQUEST"],
      ["target over 300 characters", { target: "t".repeat(301) }, "INVALID_REQUEST"],
      ["target that is not one", { target: "not a target:::" }, "INVALID_TARGET"],
      ["name in use", { name: "WebSpeak" }, "SERVER_NAME_TAKEN"],
    ];
    for (const [label, override, code] of cases) {
      const response = await create(admin, override);
      expect([response.status, (await json(response)).code], label).toEqual([400, code]);
    }
    expect((await admin.post("servers", [1])).status).toBe(400);
    expect((await json(await admin.get("servers"))).servers).toHaveLength(1);
  });

  it("saves a new order and answers with the list in it", async () => {
    const { gateway, admin } = await start();
    const added = (await json(await create(admin))).server;
    const response = await admin.put("servers/order", { ids: [added.id, DEFAULT_SERVER_ID] });
    expect([response.status, (await json(response)).servers.map((server: { id: string }) => server.id)]).toEqual([
      200,
      [added.id, DEFAULT_SERVER_ID],
    ]);
    expect((await json(await admin.get("servers"))).servers[0].id).toBe(added.id);
    expect(audit(gateway)[0]).toBe("SERVERS_REORDERED");
  });

  it("refuses an order that is not every server once, and keeps the old one", async () => {
    const { admin } = await start();
    await create(admin);
    for (const ids of [[DEFAULT_SERVER_ID], [DEFAULT_SERVER_ID, DEFAULT_SERVER_ID], "nope", undefined]) {
      const response = await admin.put("servers/order", { ids });
      expect([response.status, (await json(response)).code], JSON.stringify(ids)).toEqual([400, "INVALID_SERVER_ORDER"]);
    }
    expect((await json(await admin.get("servers"))).servers[0].id).toBe(DEFAULT_SERVER_ID);
  });

  it("answers an unknown or malformed id with 400 SERVER_NOT_FOUND", async () => {
    const { admin } = await start();
    for (const id of ["server-gone", "x", "server-a%20b"]) {
      for (const response of [
        await admin.put(`servers/${id}`, serverInput()),
        await admin.delete(`servers/${id}`),
        await admin.post(`servers/${id}/test`, {}),
      ]) {
        expect([response.status, (await json(response)).code], id).toEqual([400, "SERVER_NOT_FOUND"]);
      }
    }
  });

  it("keeps the last server while access is limited to the list", async () => {
    const { admin } = await start();
    await admin.put("server", settingsInput({ accessMode: "fixed" }));
    const response = await admin.delete(`servers/${DEFAULT_SERVER_ID}`);
    expect([response.status, (await json(response)).code]).toEqual([400, "SERVERS_REQUIRED"]);
  });

  it("refuses limiting access to the list when it is empty", async () => {
    const { admin } = await start();
    await admin.put("server", settingsInput({ accessMode: "open" }));
    await admin.delete(`servers/${DEFAULT_SERVER_ID}`);
    const response = await admin.put("server", settingsInput({ accessMode: "fixed" }));
    expect([response.status, (await json(response)).code]).toEqual([400, "SERVERS_REQUIRED"]);
  });
});

describe("POST /servers/:id/test", () => {
  const hostPing = { ok: true, latencyMs: 3, packetLossPercent: 0, attempts: 4, successfulAttempts: 4 };

  it("tests the saved address, keeps the result with the server and logs a change of availability", async () => {
    const { gateway, admin } = await start();
    await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput());
    expect(await json(await admin.post(`servers/${DEFAULT_SERVER_ID}/test`, {}))).toEqual({ ok: true, latencyMs: 12, hostPing });
    expect(gateway.probe).toHaveBeenCalledWith({ host: "ts.example.org", port: 9988 });
    expect((await json(await admin.get("servers"))).servers[0]).toMatchObject({ lastTestLatencyMs: 12, lastTestError: null });
    gateway.probe.mockRejectedValueOnce(new TeamSpeakProbeError("NO_ANSWER", "silent"));
    expect(await json(await admin.post(`servers/${DEFAULT_SERVER_ID}/test`, {}))).toMatchObject({ ok: false, errorCode: "NO_ANSWER" });
    expect((await json(await admin.get("servers"))).servers[0]).toMatchObject({ lastTestLatencyMs: null, lastTestError: "NO_ANSWER" });
    expect(audit(gateway).slice(0, 2)).toEqual(["SERVER_UNAVAILABLE", "SERVER_UPDATED"]);
  });

  it("forgets the result when the address changes", async () => {
    const { admin } = await start();
    await admin.post(`servers/${DEFAULT_SERVER_ID}/test`, {});
    await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput({ target: "other.example.org:9987" }));
    expect((await json(await admin.get("overview"))).servers[0]).toMatchObject({
      target: "other.example.org:9987",
      status: "unknown",
      lastTestAt: null,
      lastError: null,
    });
  });
});
