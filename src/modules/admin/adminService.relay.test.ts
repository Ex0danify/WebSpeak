import { describe, expect, it, vi } from "vitest";
import { settingsInput, useAdminService } from "../../../test/support/adminService.js";
import { AdminInputError, type AdminService, type RelayNodeInput } from "./adminService.js";

const ctx = useAdminService();
const TOKEN = "relay-token-1234567";

function rejection(action: () => unknown): AdminInputError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminInputError);
    return error as AdminInputError;
  }
  throw new Error("expected the action to throw");
}

const node = (overrides: Partial<RelayNodeInput> = {}): RelayNodeInput => ({
  name: "Relay",
  target: "relay.example.org",
  enabled: true,
  token: TOKEN,
  ...overrides,
});

function withNodes(service: AdminService, relayNodes: RelayNodeInput[]): void {
  service.updateSettings(settingsInput({ relayNodes }));
}

describe("relay nodes", () => {
  const cases: Array<[string, RelayNodeInput[], string]> = [
    ["an empty name", [node({ name: "  " })], "INVALID_RELAY_NAME"],
    ["a name over 80 characters", [node({ name: "x".repeat(81) })], "INVALID_RELAY_NAME"],
    ["an empty target", [node({ target: "" })], "INVALID_RELAY_TARGET"],
    ["a target over 300 characters", [node({ target: `${"a".repeat(300)}.example.org` })], "INVALID_RELAY_TARGET"],
    ["an unparsable target", [node({ target: "bad target:::" })], "INVALID_RELAY_TARGET"],
    ["an enabled node without a token", [node({ token: undefined })], "INVALID_RELAY_TOKEN"],
    ["an enabled node with a token under 16 characters", [node({ token: "short" })], "INVALID_RELAY_TOKEN"],
    ["a duplicate id", [node({ id: "relay-a" }), node({ id: "relay-a" })], "INVALID_RELAY_ID"],
    ["more than 16 nodes", Array.from({ length: 17 }, (_, index) => node({ name: `n${index}` })), "INVALID_RELAY_NODES"],
  ];

  it.each(cases)("rejects %s and stores nothing", (_name, nodes, code) => {
    const service = ctx.create();
    expect(rejection(() => withNodes(service, nodes)).code).toBe(code);
    expect(service.database.listRelayNodes()).toEqual([]);
  });

  it("rejects a relayNodes value that is not an array", () => {
    expect(rejection(() => withNodes(ctx.create(), "nope" as never)).code).toBe("INVALID_RELAY_NODES");
  });

  it("accepts 16 nodes, a disabled node without a token, and a 16 character token", () => {
    const service = ctx.create();
    withNodes(
      service,
      Array.from({ length: 16 }, (_, index) =>
        node({ name: `n${index}`, enabled: index === 0, token: index === 0 ? "x".repeat(16) : undefined }),
      ),
    );
    expect(service.database.listRelayNodes()).toHaveLength(16);
  });

  it("uses a given relay-* id, generates one otherwise, and defaults the port to 39087", () => {
    const service = ctx.create();
    withNodes(service, [
      node({ id: "relay-mine" }),
      node({ id: "not valid!", name: "B" }),
      node({ name: "C", target: "host.example.org:1234" }),
    ]);
    const nodes = service.database.listRelayNodes();
    const byName = Object.fromEntries(nodes.map((entry) => [entry.name, entry]));
    expect(byName.Relay).toMatchObject({ id: "relay-mine", host: "relay.example.org", port: 39087 });
    expect(byName.B!.id).toMatch(/^relay-[0-9a-f]{16}$/);
    expect(byName.C).toMatchObject({ host: "host.example.org", port: 1234 });
  });

  it("stores the token encrypted and trimmed", () => {
    const service = ctx.create();
    withNodes(service, [node({ id: "relay-a", token: `  ${TOKEN}  ` })]);
    const stored = service.database.listRelayNodes()[0]!.tokenEncrypted!;
    expect(stored).toMatch(/^v1:/);
    expect(service.getAccelerationRelayOptions()[0]?.token).toBe(TOKEN);
  });

  it("keeps the token of an existing node by default and its creation time, and replaces or removes it on request", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const service = ctx.create();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    withNodes(service, [node({ id: "relay-a" })]);
    const first = service.database.listRelayNodes()[0]!;
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    withNodes(service, [{ id: "relay-a", name: "Renamed", target: "relay.example.org", enabled: true }]);
    const kept = service.database.listRelayNodes()[0]!;
    expect(kept).toMatchObject({
      name: "Renamed",
      tokenEncrypted: first.tokenEncrypted,
      createdAt: first.createdAt,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    withNodes(service, [
      { id: "relay-a", name: "Renamed", target: "relay.example.org", enabled: true, tokenAction: "replace", token: "another-token-123456" },
    ]);
    expect(service.getAccelerationRelayOptions()[0]?.token).toBe("another-token-123456");
    withNodes(service, [{ id: "relay-a", name: "Renamed", target: "relay.example.org", enabled: false, tokenAction: "remove" }]);
    expect(service.database.listRelayNodes()[0]?.tokenEncrypted).toBeNull();
  });

  it("does not carry a token over to a node with a new id", () => {
    const service = ctx.create();
    withNodes(service, [node({ id: "relay-a" })]);
    expect(rejection(() => withNodes(service, [{ id: "relay-b", name: "B", target: "b.example.org", enabled: true }])).code).toBe(
      "INVALID_RELAY_TOKEN",
    );
  });

  it("leaves the nodes alone when the form has no relay fields", () => {
    const service = ctx.create();
    withNodes(service, [node({ id: "relay-a" })]);
    service.updateSettings(settingsInput({ siteName: "Other" }));
    expect(service.database.listRelayNodes().map((entry) => entry.id)).toEqual(["relay-a"]);
  });

  it("offers only enabled nodes that have a token, with the token decrypted", () => {
    const service = ctx.create();
    withNodes(service, [
      node({ id: "relay-a", name: "A" }),
      node({ id: "relay-b", name: "B", enabled: false }),
      node({ id: "relay-c", name: "C", enabled: false, token: undefined }),
    ]);
    expect(service.getAccelerationRelayOptions()).toEqual([
      { id: "relay-a", name: "A", relayHost: "relay.example.org", relayPort: 39087, token: TOKEN },
    ]);
    expect(service.getAccelerationRelayName()).toBe("A");
  });

  it("skips and logs a node whose token cannot be decrypted, without leaking the token", () => {
    withNodes(ctx.create(), [node({ id: "relay-a" })]);
    const other = ctx.create(Buffer.alloc(32, 9));
    expect(other.getAccelerationRelayOptions()).toEqual([]);
    expect(other.getAccelerationRelayName()).toBeUndefined();
    expect(ctx.logger.error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(ctx.logger.error.mock.calls)).not.toContain(TOKEN);
  });
});
