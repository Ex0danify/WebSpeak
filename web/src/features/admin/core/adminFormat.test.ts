import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { Language } from "@/shared/i18n/common";
import { useI18n } from "@/shared/i18n/useI18n";
import { createAdminFormat } from "@/features/admin/core/adminFormat";

function setup(initial: Language = "en") {
  const language = ref<Language>(initial);
  const t = (key: string, params: Record<string, string | number> = {}) =>
    `${key}${Object.keys(params).length ? JSON.stringify(params) : ""}`;
  return { language, format: createAdminFormat(language, t) };
}

/** The same formatters over the real catalog, for text that must render in each language. */
function setupReal(initial: Language) {
  const { language, t, setLanguage } = useI18n();
  setLanguage(initial);
  return { language, setLanguage, format: createAdminFormat(language, t) };
}

describe("createAdminFormat", () => {
  it("formats durations per language and follows a language switch", () => {
    const { setLanguage, format } = setupReal("en");
    expect(format.formatUptime(3720)).toBe("Up 1h 2m");
    expect(format.formatAge(45)).toBe("45s");
    expect(format.formatAge(125)).toBe("2m");
    expect(format.formatAge(3900)).toBe("1h 5m");
    expect(format.formatAge(null)).toBe("—");
    setLanguage("de");
    expect(format.formatUptime(3720)).toBe("1h 2 Min. aktiv");
    expect(format.formatAge(45)).toBe("45 Sek.");
  });

  it("formats a missing date as a dash", () => {
    expect(setup().format.formatDate(null)).toBe("—");
  });

  it("describes what a session carried, and mentions drops and send errors only when there were some", () => {
    const { format } = setupReal("en");
    const audio = { talkSeconds: 125, framesSent: 6250, framesReceived: 1800, droppedFrames: 0, sendErrors: 0 };
    expect(format.connectionAudioLines(null)).toEqual([]);
    expect(format.connectionAudioLines(audio)).toEqual(["Talked 2m · 6,250 frames sent · 1,800 received"]);
    expect(format.connectionAudioLines({ ...audio, droppedFrames: 3, sendErrors: 1 })).toEqual([
      "Talked 2m · 6,250 frames sent · 1,800 received",
      "3 frames dropped",
      "1 send errors",
    ]);
  });

  it("labels session states, falling back to the raw state", () => {
    const { setLanguage, format } = setupReal("de");
    expect(format.sessionStateLabel("connected")).toBe("Verbunden");
    expect(format.sessionStateLabel("mystery")).toBe("mystery");
    setLanguage("en");
    expect(format.sessionStateLabel("connected")).toBe("Connected");
  });

  it("describes a connection route with and without a relay", () => {
    const { format } = setup();
    const base = { clientIp: "1.2.3.4", target: "ts:9987" } as any;
    expect(format.connectionRoute(base)).toBe('connectionFromTo{"ip":"1.2.3.4","target":"ts:9987"}');
    expect(format.connectionRoute({ ...base, relayName: "eu" })).toContain('connectionViaRelay{"relay":"eu"}');
  });

  it("maps error codes to text, and connection failures fall through to errorText", () => {
    const { format } = setupReal("en");
    expect(format.errorText("RATE_LIMITED")).toBe("Too many attempts. Try again later.");
    expect(format.errorText("HOST_NOT_FOUND")).toBe("The server hostname could not be resolved.");
    expect(format.errorText("nope")).toBe("The request failed. Check the fields and try again.");
    expect(format.connectionFailureText("TIMEOUT")).toBe("Network request timed out");
    expect(format.connectionFailureText("TARGET_NOT_ALLOWED")).toBe("This target is not allowed in open mode.");
    expect(format.errorText("INVALID_IDENTITY_MINT_LEVEL")).toBe("The maximum security level is invalid. Use 1–24.");
    expect(format.errorText("INVALID_IDENTITY_MINT_QUEUE_DEPTH")).toBe("The queue depth is invalid. Use 0–100.");
  });
});
