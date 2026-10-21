import { describe, expect, it } from "vitest";
import { findOffset, generateIdentity } from "./identity.js";
import { generateIdentityAsync, upgradeIdentity } from "./identityWorker.js";

describe("upgradeIdentity", () => {
  it("finds the same offset as the search on the main thread", async () => {
    const identity = generateIdentity(0).withOffset(1000n);
    const upgraded = await upgradeIdentity(identity, 12);
    expect(upgraded.offset).toBe(findOffset(identity.publicKeyBase64, 1000n, 12));
    expect(upgraded.securityLevel()).toBeGreaterThanOrEqual(12);
    expect(upgraded.publicKeyBase64).toBe(identity.publicKeyBase64);
  });

  it("rejects at once with an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    await expect(upgradeIdentity(generateIdentity(0), 8, { signal: controller.signal })).rejects.toThrow("stop");
  });

  it("stops a running search on abort", async () => {
    const controller = new AbortController();
    // Level 60 takes far longer than this test, so only the abort can end it.
    const search = upgradeIdentity(generateIdentity(0), 60, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error("stop")), 50);
    await expect(search).rejects.toThrow("stop");
  });

  it("surfaces a worker that fails", async () => {
    const broken = Object.assign(Object.create(Object.getPrototypeOf(generateIdentity(0))), { publicKeyBase64: undefined, offset: 0n });
    await expect(upgradeIdentity(broken, 8)).rejects.toThrow();
  });
});

describe("generateIdentityAsync", () => {
  it("makes a new identity at the level", async () => {
    const identity = await generateIdentityAsync(10);
    expect(identity.securityLevel()).toBeGreaterThanOrEqual(10);
  });
});
