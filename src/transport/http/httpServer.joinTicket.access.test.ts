import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_ID, serverInput } from "../../../test/support/adminService.js";
import { type Gateway, useGateway } from "../../../test/support/gateway.js";
import { configure, issued, post } from "../../../test/support/joinTicket.js";

const gateways = useGateway();

afterEach(() => {
  vi.useRealTimers();
});

describe("fixed access mode", () => {
  it("joins the server the browser picked by id, and takes a non-blank server password from it", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "fixed", passwordAction: "replace", serverPassword: "admin-pass" });
    const other = gateway.adminService.createServer(serverInput({ name: "Other", target: "9.9.9.9:9" }));
    expect(await issued(gateway, { nickname: "a", serverId: other.id, serverPassword: "typed" })).toMatchObject({
      target: { host: "9.9.9.9", port: 9 },
      serverPassword: "typed",
    });
    expect((await issued(gateway, { nickname: "a", serverPassword: "   " })).serverPassword).toBe("admin-pass");
  });

  it("ignores an address from the browser and refuses a join without a known server", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "fixed" });
    expect(await issued(gateway, { nickname: "a", serverId: DEFAULT_SERVER_ID, target: "1.1.1.1:1111" })).toMatchObject({
      target: { host: "8.8.8.8", port: 9988 },
    });
    for (const body of [
      { nickname: "a", target: "1.1.1.1:1111" },
      { nickname: "a", serverId: "server-gone" },
    ]) {
      expect(await post(gateway, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { code: "TARGET_NOT_ALLOWED" } });
    }
  });

  it("joins a configured server on a loopback or LAN address without the guard", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "127.0.0.1:9987", accessMode: "fixed" });
    const lan = gateway.adminService.createServer(serverInput({ name: "LAN", target: "192.168.1.5:9987" }));
    expect(await issued(gateway, { nickname: "a" })).toMatchObject({ target: { host: "127.0.0.1", port: 9987 } });
    expect(await issued(gateway, { nickname: "a", serverId: lan.id })).toMatchObject({ target: { host: "192.168.1.5", port: 9987 } });
  });
});

describe("a typed server password", () => {
  it("is refused for a while after the server rejected one, and the admin's own password is not slowed", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "fixed", passwordAction: "replace", serverPassword: "admin-pass" });
    const first = await issued(gateway, { nickname: "a", serverPassword: "guess" });
    first.reportPasswordOutcome?.(false);
    const retry = await post(gateway, { nickname: "a", serverPassword: "guess2" });
    expect(retry.status).toBe(429);
    expect(Number(retry.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await issued(gateway, { nickname: "a" })).serverPassword).toBe("admin-pass");
  });
});

describe("open access mode", () => {
  const openMode = (gateway: Gateway) =>
    configure(gateway, { target: "8.8.8.8:9988", accessMode: "open", passwordAction: "replace", serverPassword: "admin-pass" });

  it("accepts a public target from the browser", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    expect(await issued(gateway, { nickname: "a", target: "1.1.1.1:5555" })).toMatchObject({ target: { host: "1.1.1.1", port: 5555 } });
  });

  it("refuses private, loopback, link-local and unparsable targets with 400 TARGET_NOT_ALLOWED", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    for (const target of [
      "10.0.0.5:9987",
      "127.0.0.1:9987",
      "192.168.1.5",
      "169.254.169.254:80",
      "[::1]:9987",
      "localhost",
      "not a target:::",
    ]) {
      expect(await post(gateway, { nickname: "a", target }), target).toMatchObject({
        status: 400,
        body: { ok: false, code: "TARGET_NOT_ALLOWED" },
      });
    }
  });

  it("still offers the configured servers, a loopback one included, by id", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "127.0.0.1:9987", accessMode: "open" });
    expect(await issued(gateway, { nickname: "a" })).toMatchObject({ target: { host: "127.0.0.1", port: 9987 } });
  });

  it("refuses a typed loopback target even when a configured server has the same address", async () => {
    const gateway = await gateways.start();
    configure(gateway, { target: "127.0.0.1:9987", accessMode: "open" });
    for (const target of ["127.0.0.1:9987", "127.0.0.2:9987"]) {
      expect(await post(gateway, { nickname: "a", target }), target).toMatchObject({ status: 400, body: { code: "TARGET_NOT_ALLOWED" } });
    }
  });

  it("refuses a typed address in fixed access mode", async () => {
    const gateway = await gateways.start();
    configure(gateway, { accessMode: "fixed" });
    expect(await post(gateway, { nickname: "a", target: "1.1.1.1:5555" })).toMatchObject({
      status: 400,
      body: { code: "TARGET_NOT_ALLOWED" },
    });
  });

  it("never sends the administrator's server password to a target the browser chose", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    expect((await issued(gateway, { nickname: "a", target: "1.1.1.1:5555" })).serverPassword).toBe("");
    expect((await issued(gateway, { nickname: "a", target: "1.1.1.1:5555", serverPassword: "typed" })).serverPassword).toBe("typed");
    expect((await issued(gateway, { nickname: "a", target: "1.1.1.1:5555", serverPassword: "p".repeat(600) })).serverPassword).toBe(
      "p".repeat(512),
    );
  });

  it("keeps the saved password of a configured server, unless the browser sends its own", async () => {
    const gateway = await gateways.start();
    openMode(gateway);
    expect((await issued(gateway, { nickname: "a" })).serverPassword).toBe("admin-pass");
    expect((await issued(gateway, { nickname: "a", serverPassword: "typed" })).serverPassword).toBe("typed");
    expect(await issued(gateway, { nickname: "a" })).toMatchObject({
      target: { host: "8.8.8.8", port: 9988 },
      serverPassword: "admin-pass",
    });
  });
});
