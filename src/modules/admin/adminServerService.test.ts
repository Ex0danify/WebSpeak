import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER_ID, serverInput, useAdminService } from "../../../test/support/adminService.js";
import { SERVER_LIMIT } from "./adminServerService.js";
import { AdminInputError } from "./adminService.js";

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

describe("creating a server", () => {
  it("adds it last with a generated id, the address normalized and the password encrypted", () => {
    const service = ctx.create();
    const created = service.createServer(serverInput({ name: "  Friends  ", target: "TS.Example.org", serverPassword: "pw-1" }));
    expect(created).toMatchObject({ name: "Friends", target: "ts.example.org:9987", hasPassword: true, lastTestAt: null });
    expect(created.id).toMatch(/^server-[0-9a-f]{16}$/);
    expect(service.listServers().map((server) => server.id)).toEqual([DEFAULT_SERVER_ID, created.id]);
    const stored = service.database.getServer(created.id)!.passwordEncrypted;
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("pw-1");
  });

  it("stores no password when it is empty", () => {
    expect(ctx.create().createServer(serverInput({ name: "B", serverPassword: "" })).hasPassword).toBe(false);
  });

  it.each([
    ["an empty name", { name: "   " }, "INVALID_SERVER_NAME"],
    ["a name over 80 characters", { name: "x".repeat(81) }, "INVALID_SERVER_NAME"],
    ["an unparsable address", { target: "not a target:::" }, "INVALID_TARGET"],
    ["a name that exists, whatever its case", { name: "webspeak" }, "SERVER_NAME_TAKEN"],
  ])("rejects %s and stores nothing", (_name, overrides, code) => {
    const service = ctx.create();
    expect(rejection(() => service.createServer(serverInput(overrides))).code).toBe(code);
    expect(service.listServers()).toHaveLength(1);
  });

  it("stops at the server limit", () => {
    const service = ctx.create();
    for (let index = service.listServers().length; index < SERVER_LIMIT; index++) service.createServer(serverInput({ name: `s${index}` }));
    expect(rejection(() => service.createServer(serverInput({ name: "one too many" }))).code).toBe("SERVER_LIMIT");
  });
});

describe("updating a server", () => {
  it("changes name and address, and clears the stored test result with the address", () => {
    const service = ctx.create();
    service.database.recordConnectionTest(DEFAULT_SERVER_ID, { latencyMs: 9, error: null });
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ name: "Renamed", target: "127.0.0.1:9987" }));
    expect(service.database.getServer(DEFAULT_SERVER_ID)).toMatchObject({ name: "Renamed", lastTestLatencyMs: 9 });
    expect(service.updateServer(DEFAULT_SERVER_ID, serverInput())).toMatchObject({ target: "ts.example.org:9988", lastTestAt: null });
  });

  it("keeps, replaces and removes the password", () => {
    const service = ctx.create();
    const passwordOf = () => service.resolveServer(DEFAULT_SERVER_ID)!.serverPassword;
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ serverPassword: "pw-1" }));
    expect(passwordOf()).toBe("pw-1");
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ passwordAction: "keep", serverPassword: "ignored" }));
    expect(passwordOf()).toBe("pw-1");
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ passwordAction: "replace", serverPassword: "pw-2" }));
    expect(passwordOf()).toBe("pw-2");
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ passwordAction: "remove" }));
    expect(service.listServers()[0]!.hasPassword).toBe(false);
  });

  it("lets a server keep its own name but not take another's", () => {
    const service = ctx.create();
    const other = service.createServer(serverInput({ name: "Other" }));
    service.updateServer(other.id, serverInput({ name: "OTHER" }));
    expect(rejection(() => service.updateServer(other.id, serverInput({ name: "WebSpeak" }))).code).toBe("SERVER_NAME_TAKEN");
  });

  it("rejects an unknown server", () => {
    expect(rejection(() => ctx.create().updateServer("server-gone", serverInput())).code).toBe("SERVER_NOT_FOUND");
  });
});

describe("resolving a server for a visitor", () => {
  it("returns the saved address and decrypted password, and null once removed", () => {
    const service = ctx.create();
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ serverPassword: "pw-1" }));
    expect(service.resolveServer(DEFAULT_SERVER_ID)).toEqual({
      id: DEFAULT_SERVER_ID,
      name: "Test server",
      target: { host: "ts.example.org", port: 9988 },
      serverPassword: "pw-1",
    });
    service.updateSettings({ ...{ accessMode: "open" as const, siteName: "s", webRtcEnabled: false } });
    service.removeServer(DEFAULT_SERVER_ID);
    expect(service.resolveServer(DEFAULT_SERVER_ID)).toBeNull();
  });

  it("gives an empty password and logs an error when it cannot be decrypted (wrong master secret)", () => {
    ctx.create().updateServer(DEFAULT_SERVER_ID, serverInput({ serverPassword: "pw-1" }));
    expect(ctx.create(Buffer.alloc(32, 9)).resolveServer(DEFAULT_SERVER_ID)!.serverPassword).toBe("");
    expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ctx.logger.error.mock.calls)).not.toContain("pw-1");
  });
});

describe("reordering the servers", () => {
  it("saves the order, which the list and the public config then follow", () => {
    const service = ctx.create();
    const a = service.createServer(serverInput({ name: "A", target: "a.example.org" }));
    const b = service.createServer(serverInput({ name: "B", target: "b.example.org" }));
    service.reorderServers([b.id, DEFAULT_SERVER_ID, a.id]);
    expect(service.listServers().map((server) => server.id)).toEqual([b.id, DEFAULT_SERVER_ID, a.id]);
    expect((service.getPublicConfig().servers as Array<{ id: string }>).map((server) => server.id)).toEqual([
      b.id,
      DEFAULT_SERVER_ID,
      a.id,
    ]);
    expect(service.createServer(serverInput({ name: "C", target: "c.example.org" })).id).toBe(service.listServers().at(-1)!.id);
    expect(service.database.recentAudit(10).map((entry) => entry.event)).toContain("SERVERS_REORDERED");
  });

  it.each([
    ["a missing server", (ids: string[]) => ids.slice(1)],
    ["a repeated server", (ids: string[]) => [ids[0], ids[0]]],
    ["an unknown server", (ids: string[]) => [...ids.slice(1), "server-gone"]],
    ["something that is no list", () => "nope"],
  ])("rejects %s and keeps the order", (_name, build) => {
    const service = ctx.create();
    service.createServer(serverInput({ name: "A", target: "a.example.org" }));
    const before = service.listServers().map((server) => server.id);
    expect(rejection(() => service.reorderServers(build(before) as never)).code).toBe("INVALID_SERVER_ORDER");
    expect(service.listServers().map((server) => server.id)).toEqual(before);
  });
});
