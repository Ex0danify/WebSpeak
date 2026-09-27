import { describe, expect, it } from "vitest";
import { LICENSE_VARIABLE, allowListFor, requireLicenseAccepted, slotFor } from "../e2e/real/server";

describe("license of the disposable TeamSpeak server", () => {
  it("refuses to start while the person running the tests has not accepted it", () => {
    expect(() => requireLicenseAccepted({})).toThrow(/must be accepted by the person running the tests/);
  });

  it.each(["", "yes", "true", "1", "ACCEPT", " accept"])("does not take %j as acceptance", (value) => {
    expect(() => requireLicenseAccepted({ [LICENSE_VARIABLE]: value })).toThrow(/license/);
  });

  it("names the one line to export, and does not put a value in it that starts the server by copy", () => {
    let message = "";
    try {
      requireLicenseAccepted({});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(`${LICENSE_VARIABLE}=accept npm run test:real`);
    expect(message).toContain("Nothing in this repository sets it");
  });

  it("accepts exactly the value the server image expects", () => {
    expect(() => requireLicenseAccepted({ [LICENSE_VARIABLE]: "accept" })).not.toThrow();
  });
});

describe("server slots", () => {
  it("slot 0 is the plan's port for voice, and every slot has its own ports, project and network", () => {
    expect(slotFor(0)).toMatchObject({ voicePort: 19987, project: "webspeak-test-ts-0", subnet: "172.29.87.0/24", gateway: "172.29.87.1" });
    const slots = [0, 1, 2, 3].map(slotFor);
    for (const key of ["voicePort", "queryPort", "project", "subnet"] as const) {
      expect(new Set(slots.map((s) => s[key])).size).toBe(slots.length);
    }
  });

  it("never lands on a default TeamSpeak port", () => {
    for (let n = 0; n <= 100; n++) {
      const { voicePort, queryPort } = slotFor(n);
      expect([9987, 10011, 10022, 10080, 30033]).not.toContain(voicePort);
      expect([9987, 10011, 10022, 10080, 30033]).not.toContain(queryPort);
    }
  });

  it.each([-1, 101, 1.5, Number.NaN])("refuses slot %s", (n) => {
    expect(() => slotFor(n)).toThrow(/WEBSPEAK_TEST_TS_SLOT/);
  });

  it("allow-lists the loopback and the slot's bridge gateway, one address per line", () => {
    expect(allowListFor(slotFor(2))).toBe("127.0.0.1\n::1\n172.29.89.1\n");
  });
});
