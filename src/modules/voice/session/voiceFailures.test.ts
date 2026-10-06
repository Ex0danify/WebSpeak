import { describe, expect, it, vi } from "vitest";
import { classifyOperationError, publicFailureDetail, sendProtocolError } from "./voiceFailures.js";

type Normalized = Parameters<typeof publicFailureDetail>[0];

function normalized(diagnostics: { serverMessage?: string; id?: string }): Normalized {
  return { diagnostics } as unknown as Normalized;
}

describe("publicFailureDetail", () => {
  it("joins the server message and the error id", () => {
    expect(publicFailureDetail(normalized({ serverMessage: "channel full", id: "769" }))).toBe("channel full; server error id=769");
  });

  it("returns undefined when there is nothing to show", () => {
    expect(publicFailureDetail(normalized({}))).toBeUndefined();
    expect(publicFailureDetail(normalized({ serverMessage: "  ", id: " " }))).toBeUndefined();
  });

  it("strips control characters, collapses whitespace and caps at 160 characters", () => {
    expect(publicFailureDetail(normalized({ serverMessage: "a\u0000b\n\nc\t d" }))).toBe("a b c d");
    expect(publicFailureDetail(normalized({ serverMessage: "x".repeat(300) }))?.length).toBe(160);
  });
});

describe("classifyOperationError", () => {
  const classify = (error: unknown) => classifyOperationError(error, "FALLBACK", "fallback message");

  it.each([
    ["permission denied", "PERMISSION_DENIED"],
    ["insufficient client permissions", "PERMISSION_DENIED"],
    ["invalid channel id", "CHANNEL_NOT_FOUND"],
    ["error id=768", "CHANNEL_NOT_FOUND"],
    ["channel password required", "CHANNEL_PASSWORD_REQUIRED"],
    ["already member of channel", "ALREADY_IN_CHANNEL"],
    ["channel is full", "CHANNEL_FULL"],
    ["unknown client", "CLIENT_NOT_FOUND"],
  ])("maps %j to %s", (text, code) => {
    expect(classify(new Error(text)).code).toBe(code);
  });

  it("keeps the text of the matched rule", () => {
    expect(classify(new Error("permission denied"))).toEqual({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限" });
  });

  it("consults a server error id before the keyword rules", () => {
    // "full" would match CHANNEL_FULL, but 781 is the channel password error.
    expect(classify({ id: 781, message: "channel is full" }).code).toBe("CHANNEL_PASSWORD_REQUIRED");
  });

  it("falls back to the given code and message", () => {
    expect(classify(new Error("something odd"))).toEqual({ code: "FALLBACK", message: "fallback message" });
    expect(classify("plain string")).toEqual({ code: "FALLBACK", message: "fallback message" });
  });
});

describe("sendProtocolError", () => {
  it("sends a non-recoverable error frame", () => {
    const sendJson = vi.fn();
    sendProtocolError(sendJson, "SESSION_NOT_READY", "msg");
    expect(sendJson).toHaveBeenCalledExactlyOnceWith({ type: "error", error: { code: "SESSION_NOT_READY", message: "msg", recoverable: false } });
  });
});
