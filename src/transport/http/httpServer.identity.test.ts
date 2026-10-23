import { describe, expect, it } from "vitest";
import { generateIdentity, identityFromString } from "../../lib/teamspeak/index.js";
import { settingsInput } from "../../../test/support/adminService.js";
import { type Gateway, useGateway } from "../../../test/support/gateway.js";

const gateways = useGateway();
const JSON_HEADERS = { "content-type": "application/json" };

function configure(gateway: Gateway, overrides: Parameters<typeof settingsInput>[0]) {
  gateway.adminService.updateSettings(settingsInput(overrides));
}

async function postJson(gateway: Gateway, path: string, body: unknown, headers = JSON_HEADERS) {
  const response = await gateway.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
}

/** Collects the `event: …\ndata: …` blocks of an SSE body into `{ event, data }` pairs. */
async function stream(gateway: Gateway, body: unknown) {
  const response = await gateway.request("/api/identity", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  const text = await response.text();
  const events = text
    .split("\n\n")
    .filter((block) => block.trim())
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? "";
      const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null") as Record<string, unknown>;
      return { event, data };
    });
  return { status: response.status, contentType: response.headers.get("content-type"), events };
}

describe("POST /api/identity (mint)", () => {
  it("rejects a request that is not same-origin JSON with 403", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/identity", {
      method: "POST",
      headers: { ...JSON_HEADERS, origin: "https://evil.example" },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ORIGIN_REJECTED" });
  });

  it("answers 503 NOT_INITIALIZED before an administrator account exists", async () => {
    const gateway = await gateways.start({ initialize: false });
    expect(await postJson(gateway, "/api/identity", {})).toMatchObject({ status: 503, body: { code: "NOT_INITIALIZED" } });
  });

  it("caps the requested level at the admin maximum with LEVEL_TOO_HIGH", async () => {
    const gateway = await gateways.start();
    configure(gateway, { identityMintMaxLevel: 2 });
    expect(await postJson(gateway, "/api/identity", { level: 5 })).toMatchObject({ status: 400, body: { code: "LEVEL_TOO_HIGH" } });
  });

  it("rejects a level below the minimum with INVALID_LEVEL", async () => {
    const gateway = await gateways.start();
    expect(await postJson(gateway, "/api/identity", { level: 0 })).toMatchObject({ status: 400, body: { code: "INVALID_LEVEL" } });
  });

  it("refuses with 429 MINT_BUSY once the queue has no capacity", async () => {
    const gateway = await gateways.start();
    configure(gateway, { identityMintConcurrency: 1, identityMintQueueDepth: 0, identityMintMaxLevel: 24 });
    // The level-24 worker occupies the only slot; awaiting its headers means the mint is already active.
    const slow = await gateway.request("/api/identity", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ level: 24 }) });
    expect(slow.status).toBe(200);
    const busy = await postJson(gateway, "/api/identity", { level: 24 });
    expect(busy).toMatchObject({ status: 429, body: { code: "MINT_BUSY" } });
    expect(busy.headers.get("retry-after")).toBe("5");
    // Dropping the connection aborts the long worker instead of leaving it to pin a core.
    await gateway.close();
    await slow.text().catch(() => undefined);
  });

  it("streams minting progress and ends with a usable identity", async () => {
    const gateway = await gateways.start();
    configure(gateway, { identityMintMaxLevel: 2 });
    const { status, contentType, events } = await stream(gateway, {});
    expect(status).toBe(200);
    expect(contentType).toContain("text/event-stream");
    expect(events.some((entry) => entry.event === "minting")).toBe(true);
    const final = events.find((entry) => entry.event === "identity");
    expect(final).toBeDefined();
    const identity = identityFromString(final!.data.identity as string);
    expect(identity.securityLevel()).toBeGreaterThanOrEqual(2);
  });
});

describe("POST /api/identity/validate", () => {
  it("accepts a well-formed identity and reports its level", async () => {
    const gateway = await gateways.start();
    const identity = generateIdentity(0).toString();
    const result = await postJson(gateway, "/api/identity/validate", { identity });
    expect(result).toMatchObject({ status: 200, body: { ok: true } });
    expect(typeof result.body.level).toBe("number");
  });

  it("rejects malformed material with 400 INVALID_IDENTITY", async () => {
    const gateway = await gateways.start();
    expect(await postJson(gateway, "/api/identity/validate", { identity: "not-an-identity" })).toMatchObject({
      status: 400,
      body: { code: "INVALID_IDENTITY" },
    });
  });
});

describe("POST /api/identity/status", () => {
  it("answers 503 NOT_INITIALIZED before an administrator account exists", async () => {
    const gateway = await gateways.start({ initialize: false });
    expect(await postJson(gateway, "/api/identity/status", {})).toMatchObject({ status: 503, body: { code: "NOT_INITIALIZED" } });
  });

  it("rejects malformed material with 400 INVALID_IDENTITY", async () => {
    const gateway = await gateways.start();
    expect(await postJson(gateway, "/api/identity/status", { identity: "nope" })).toMatchObject({
      status: 400,
      body: { code: "INVALID_IDENTITY" },
    });
  });

  it("reports a valid identity as not in use when no session holds its lease", async () => {
    const gateway = await gateways.start();
    const identity = generateIdentity(0).toString();
    expect(await postJson(gateway, "/api/identity/status", { identity })).toMatchObject({
      status: 200,
      body: { ok: true, inUse: false },
    });
  });

  it("treats an unresolvable open-mode target as not in use", async () => {
    const gateway = await gateways.start();
    configure(gateway, { accessMode: "open" });
    const identity = generateIdentity(0).toString();
    expect(await postJson(gateway, "/api/identity/status", { identity, target: "nonexistent.invalid:9987" })).toMatchObject({
      status: 200,
      body: { ok: true, inUse: false },
    });
  });
});
