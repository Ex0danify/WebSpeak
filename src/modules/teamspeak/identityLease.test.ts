import { describe, expect, it } from "vitest";
import { IdentityLeaseStore } from "./identityLease.js";

describe("IdentityLeaseStore", () => {
  it("grants a free key to the first owner", () => {
    const leases = new IdentityLeaseStore();
    expect(leases.acquire("host:9987:uid", "session-a")).toBe(true);
  });

  it("refuses a second owner for the same key (one identity, one live session)", () => {
    const leases = new IdentityLeaseStore();
    leases.acquire("k", "a");
    expect(leases.acquire("k", "b")).toBe(false);
  });

  it("lets the current owner acquire again", () => {
    const leases = new IdentityLeaseStore();
    leases.acquire("k", "a");
    expect(leases.acquire("k", "a")).toBe(true);
  });

  it("keeps different keys independent", () => {
    const leases = new IdentityLeaseStore();
    leases.acquire("k1", "a");
    expect(leases.acquire("k2", "b")).toBe(true);
  });

  it("frees the key when the owner releases it", () => {
    const leases = new IdentityLeaseStore();
    leases.acquire("k", "a");
    leases.release("k", "a");
    expect(leases.acquire("k", "b")).toBe(true);
  });

  it("ignores a release by a non-owner", () => {
    const leases = new IdentityLeaseStore();
    leases.acquire("k", "a");
    leases.release("k", "b");
    expect(leases.acquire("k", "b")).toBe(false);
    expect(leases.acquire("k", "a")).toBe(true);
  });

  it("ignores a release of an unknown key", () => {
    const leases = new IdentityLeaseStore();
    expect(() => leases.release("missing", "a")).not.toThrow();
    expect(leases.acquire("missing", "b")).toBe(true);
  });

  it("reports whether a key is currently leased", () => {
    const leases = new IdentityLeaseStore();
    expect(leases.isLeased("k")).toBe(false);
    leases.acquire("k", "a");
    expect(leases.isLeased("k")).toBe(true);
    leases.release("k", "a");
    expect(leases.isLeased("k")).toBe(false);
  });
});
