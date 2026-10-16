// The microphone failure mapping.
import { describe, expect, it } from "vitest";
import { audioNoticeText, microphoneErrorText, normalizeMicrophoneFailure } from "@/features/voice/voiceErrors";

describe("normalizeMicrophoneFailure", () => {
  function domError(name: string): Error {
    const error = new Error("english message that must not reach the UI");
    error.name = name;
    return error;
  }

  it.each([
    ["NotAllowedError", "MIC_NOTALLOWEDERROR", "micFailedPermission"],
    ["NotFoundError", "MIC_NOTFOUNDERROR", "micFailedNotFound"],
    ["OverconstrainedError", "MIC_OVERCONSTRAINEDERROR", "micFailedUnavailable"],
    ["NotReadableError", "MIC_NOTREADABLEERROR", "micFailedBusy"],
    ["SecurityError", "MIC_SECURITYERROR", "micFailedBlocked"],
    ["AbortError", "MIC_ABORTERROR", "micFailedAborted"],
  ])("%s", (name, code, key) => {
    expect(normalizeMicrophoneFailure(domError(name))).toEqual({ code, text: { key } });
  });

  it("a TypeError gets its own sentence", () => {
    expect(normalizeMicrophoneFailure(domError("TypeError"))).toEqual({
      code: "MIC_TYPEERROR",
      text: { key: "micFailedParameters" },
    });
  });

  it("uses the generic reason for an unknown error name and keeps its name as the code", () => {
    expect(normalizeMicrophoneFailure(domError("WeirdError"))).toEqual({
      code: "MIC_WEIRDERROR",
      text: { key: "micFailedGeneric" },
    });
  });

  it("reports MIC_UNAVAILABLE for a value that is not an Error", () => {
    expect(normalizeMicrophoneFailure("nope")).toEqual({
      code: "MIC_UNAVAILABLE",
      text: { key: "micFailedGeneric" },
    });
    expect(normalizeMicrophoneFailure(domError("")).code).toBe("MIC_UNAVAILABLE");
  });

  it("truncates a long error name to 40 characters", () => {
    expect(normalizeMicrophoneFailure(domError("E".repeat(100))).code).toBe(`MIC_${"E".repeat(40)}`);
  });
});

describe("microphoneErrorText", () => {
  it.each([
    ["NotAllowedError", "micFailedPermission"],
    ["NotFoundError", "micFailedNotFound"],
    ["NotReadableError", "micFailedBusy"],
    ["OverconstrainedError", "micFailedUnavailable"],
    ["SecurityError", "micFailedBlocked"],
  ] as const)("maps a %s DOMException to its sentence", (name, key) => {
    expect(microphoneErrorText(new DOMException("x", name))).toEqual({ key });
  });

  it("uses the fallback key for an unknown DOMException name", () => {
    expect(microphoneErrorText(new DOMException("x", "AbortError"), "micSwitchFailed")).toEqual({ key: "micSwitchFailed" });
  });

  it.each([undefined, null, "NotAllowedError", { name: "NotAllowedError" }])("does not throw for %j and uses the default", (value) => {
    expect(microphoneErrorText(value)).toEqual({ key: "micFailedCheckPermissions" });
  });

  it("uses the default for a plain Error, even one named like a known reason", () => {
    const error = new Error("denied");
    error.name = "NotAllowedError";
    expect(microphoneErrorText(error)).toEqual({ key: "micFailedCheckPermissions" });
  });
});

describe("audioNoticeText", () => {
  it.each([
    ["WEBRTC_FALLBACK", "audioNoticeWebrtcFallback"],
    ["PLAYBACK_BLOCKED", "audioNoticePlaybackBlocked"],
    ["DEVICE_LIST_UNAVAILABLE", "audioNoticeDeviceList"],
    ["AUDIO_CONTEXT_SUSPENDED", "audioNoticeContextSuspended"],
  ])("%s has its own sentence and passes the params on", (code, key) => {
    expect(audioNoticeText(code, { code: "X" })).toEqual({ key, params: { code: "X" } });
  });

  it("names the encoder failure specially and never prints the gateway detail", () => {
    expect(audioNoticeText("AUDIO_ENCODER_UNAVAILABLE")).toEqual({
      key: "audioNoticeEncoder",
      params: { code: "AUDIO_ENCODER_UNAVAILABLE" },
    });
    expect(audioNoticeText("AUDIO_ENCODER_UNAVAILABLE", { detail: "boom" })).toEqual({
      key: "audioNoticeEncoder",
      params: { code: "AUDIO_ENCODER_UNAVAILABLE" },
    });
  });

  it("gives every other code the generic audio-link sentence", () => {
    expect(audioNoticeText("AUDIO_X")).toEqual({ key: "audioNoticeLink", params: { code: "AUDIO_X" } });
    expect(audioNoticeText("AUDIO_X", { detail: "boom" })).toEqual({
      key: "audioNoticeLinkDetail",
      params: { code: "AUDIO_X", detail: "boom" },
    });
  });
});
