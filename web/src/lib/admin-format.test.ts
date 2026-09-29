import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { Language } from "@/i18n/common";
import { createAdminFormat } from "./admin-format";

function setup(initial: Language = "en") {
  const language = ref<Language>(initial);
  const t = (key: string, params: Record<string, string | number> = {}) => `${key}${Object.keys(params).length ? JSON.stringify(params) : ""}`;
  return { language, format: createAdminFormat(language, t) };
}

describe("createAdminFormat", () => {
  it("formats durations per language and follows a language switch", () => {
    const { language, format } = setup("en");
    expect(format.formatUptime(3720)).toBe("Up 1h 2m");
    expect(format.formatAge(45)).toBe("45s");
    expect(format.formatAge(125)).toBe("2m");
    expect(format.formatAge(3900)).toBe("1h 5m");
    expect(format.formatAge(null)).toBe("—");
    language.value = "de";
    expect(format.formatUptime(3720)).toBe("1 Std. 2 Min. aktiv");
    expect(format.formatAge(45)).toBe("45 Sek.");
  });

  it("formats a missing date as a dash", () => {
    expect(setup().format.formatDate(null)).toBe("—");
  });

  it("joins a log context as key=value pairs", () => {
    expect(setup().format.formatContext({ a: 1, b: "x", c: true })).toBe("a=1 · b=x · c=true");
  });

  it("labels session states, falling back to the raw state and to English for ru/ja", () => {
    const { language, format } = setup("de");
    expect(format.sessionStateLabel("connected")).toBe("Verbunden");
    expect(format.sessionStateLabel("mystery")).toBe("mystery");
    language.value = "ja";
    expect(format.sessionStateLabel("connected")).toBe("Connected");
  });

  it("names audit events, falling back to the event code", () => {
    const { format } = setup("en");
    expect(format.eventName("ADMIN_LOGIN_FAILED")).toBe("Administrator login failed");
    expect(format.eventName("ADMIN_LOGOUT")).toBe("logoutEvent");
    expect(format.eventName("SOME_NEW_EVENT")).toBe("SOME NEW EVENT");
  });

  it("describes a connection route with and without a relay", () => {
    const { format } = setup();
    const base = { clientIp: "1.2.3.4", target: "ts:9987" } as any;
    expect(format.connectionRoute(base)).toBe('connectionFromTo{"ip":"1.2.3.4","target":"ts:9987"}');
    expect(format.connectionRoute({ ...base, relayName: "eu" })).toContain('connectionViaRelay{"relay":"eu"}');
  });

  it("maps error codes to text, and connection failures fall through to errorText", () => {
    const { format } = setup("en");
    expect(format.errorText("RATE_LIMITED")).toBe("rateLimited");
    expect(format.errorText("HOST_NOT_FOUND")).toBe("The server hostname could not be resolved.");
    expect(format.errorText("nope")).toBe("requestFailed");
    expect(format.connectionFailureText("TIMEOUT")).toBe("networkTimeoutError");
    expect(format.connectionFailureText("TARGET_NOT_ALLOWED")).toBe("This target is not allowed in open mode.");
  });
});
