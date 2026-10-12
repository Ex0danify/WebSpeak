import { describe, expect, it } from "vitest";
import { BOOTSTRAP, useAdminService } from "../../../test/support/adminService.js";
import { AdminBootstrapError } from "./adminBootstrap.js";
import { resetAdminAccount } from "./adminReset.js";

const ctx = useAdminService();

async function initialized() {
  const service = ctx.create();
  await service.initialize(BOOTSTRAP);
  await service.changePassword("the password nobody remembers");
  return service;
}

describe("resetAdminAccount", () => {
  it("sets the new password, requires a change at the next login and audits it", async () => {
    const service = await initialized();
    expect(service.isPasswordChangeRequired()).toBe(false);
    await expect(resetAdminAccount(service.database, { password: "a fresh recovery password" })).resolves.toEqual({ username: "admin" });
    expect(await service.verifyPassword("admin", "the password nobody remembers")).toBe(false);
    expect(await service.verifyPassword("admin", "a fresh recovery password")).toBe(true);
    expect(service.isPasswordChangeRequired()).toBe(true);
    expect(service.database.recentAudit()[0]?.event).toBe("ADMIN_PASSWORD_RESET");
  });

  it("can change the username too, and keeps it otherwise", async () => {
    const service = await initialized();
    await resetAdminAccount(service.database, { password: "a fresh recovery password", username: "ops" });
    expect(await service.verifyPassword("ops", "a fresh recovery password")).toBe(true);
    expect(await service.verifyPassword("admin", "a fresh recovery password")).toBe(false);
    await resetAdminAccount(service.database, { password: "another recovery password" });
    expect(await service.verifyPassword("ops", "another recovery password")).toBe(true);
  });

  it("refuses a weak password or a bad username and changes nothing", async () => {
    const service = await initialized();
    await expect(resetAdminAccount(service.database, { password: "short" })).rejects.toThrow(AdminBootstrapError);
    await expect(resetAdminAccount(service.database, { password: "a fresh recovery password", username: "no spaces" })).rejects.toThrow(
      AdminBootstrapError,
    );
    expect(await service.verifyPassword("admin", "the password nobody remembers")).toBe(true);
    expect(service.isPasswordChangeRequired()).toBe(false);
    expect(service.database.getAdminSessionEpoch()).toBe("");
  });

  it("has nothing to reset on a database without an account", async () => {
    const service = ctx.create();
    await expect(resetAdminAccount(service.database, { password: "a fresh recovery password" })).rejects.toThrow(
      /no administrator account/i,
    );
  });

  it("starts a new session epoch every time", async () => {
    const service = await initialized();
    await resetAdminAccount(service.database, { password: "a fresh recovery password" });
    const first = service.database.getAdminSessionEpoch();
    await resetAdminAccount(service.database, { password: "another recovery password" });
    expect(first).not.toBe("");
    expect(service.database.getAdminSessionEpoch()).not.toBe(first);
  });
});
