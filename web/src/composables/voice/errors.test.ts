// Step V1.2: the failure-code and failure-message mapping, pure functions and lookup tables.
import { describe, expect, it } from "vitest";
import {
  CONNECTION_FAILURE_MESSAGES,
  NICKNAME_LENGTH_MESSAGE,
  NICKNAME_LENGTH_SIGNATURE,
  normalizeMicrophoneFailure,
  normalizedClientErrorCode,
  safeClientErrorCode,
  safeClientErrorDetail,
} from "./errors";

describe("safeClientErrorCode", () => {
  it.each([
    ["timeout", "TIMEOUT"],
    ["  Server Full  ", "SERVER_FULL"],
    ["a b!c", "A_B_C"],
    ["__x__", "X"],
    ["keep-dash_and_underscore", "KEEP-DASH_AND_UNDERSCORE"],
    ["", ""],
    [null, ""],
    [undefined, ""],
    [42, "42"],
    ["!!!", ""],
  ])("%j -> %j", (input, expected) => {
    expect(safeClientErrorCode(input)).toBe(expected);
  });

  it("caps the code at 64 characters", () => {
    expect(safeClientErrorCode("a".repeat(200))).toBe("A".repeat(64));
  });
});

describe("normalizedClientErrorCode", () => {
  it.each([
    ["PASSWORD_REQUIRED", "SERVER_PASSWORD_REQUIRED"],
    ["invalid_password", "INVALID_SERVER_PASSWORD"],
    ["AUTHENTICATION_FAILED", "INVALID_SERVER_PASSWORD"],
    ["gateway_full", "SERVER_REJECTED"],
    ["TS_CONNECT_FAILED", "CONNECTION_FAILED"],
    ["team-speak-connect-failed", "TEAM-SPEAK-CONNECT-FAILED"],
    ["ADMIN-TERMINATED", "ADMIN_TERMINATED"],
    ["SOMETHING_ELSE", "SOMETHING_ELSE"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizedClientErrorCode(input)).toBe(expected);
  });

  it("falls back to CONNECTION_FAILED, or to the given fallback, for an empty code", () => {
    expect(normalizedClientErrorCode("")).toBe("CONNECTION_FAILED");
    expect(normalizedClientErrorCode(undefined)).toBe("CONNECTION_FAILED");
    expect(normalizedClientErrorCode("  ", "REQUEST_FAILED")).toBe("REQUEST_FAILED");
    expect(normalizedClientErrorCode("", "")).toBe("");
  });
});

describe("safeClientErrorDetail", () => {
  it("replaces control characters, collapses whitespace and trims", () => {
    expect(safeClientErrorDetail("  a\u0000b\tc\n\nd\u007fe  ")).toBe("a b c d e");
  });

  it("caps the detail at 160 characters", () => {
    expect(safeClientErrorDetail("x".repeat(400))).toHaveLength(160);
  });

  it("turns nullish input into an empty string", () => {
    expect(safeClientErrorDetail(null)).toBe("");
    expect(safeClientErrorDetail(undefined)).toBe("");
  });
});

describe("NICKNAME_LENGTH_SIGNATURE", () => {
  it.each([
    "invalid parameter size",
    "Invalid_Parameter-Size",
    "error id=1541",
    "id: 1541 msg",
    "nickname is too long, length rule",
    "nickname size",
  ])("matches %j", (text) => {
    expect(NICKNAME_LENGTH_SIGNATURE.test(text)).toBe(true);
  });

  it.each(["id 15410", "something unrelated", "nickname taken"])("does not match %j", (text) => {
    expect(NICKNAME_LENGTH_SIGNATURE.test(text)).toBe(false);
  });
});

describe("normalizeMicrophoneFailure", () => {
  function domError(name: string): Error {
    const error = new Error("english message that must not reach the UI");
    error.name = name;
    return error;
  }

  it.each([
    ["NotAllowedError", "MIC_NOTALLOWEDERROR", "浏览器未授予麦克风权限"],
    ["NotFoundError", "MIC_NOTFOUNDERROR", "未找到可用的麦克风"],
    ["OverconstrainedError", "MIC_OVERCONSTRAINEDERROR", "所选麦克风当前不可用"],
    ["NotReadableError", "MIC_NOTREADABLEERROR", "麦克风可能正被其他程序占用"],
    ["SecurityError", "MIC_SECURITYERROR", "浏览器阻止了麦克风访问"],
    ["AbortError", "MIC_ABORTERROR", "麦克风启动被中断，请重试"],
  ])("%s", (name, code, reason) => {
    expect(normalizeMicrophoneFailure(domError(name))).toEqual({ code, message: `麦克风访问失败：${reason}` });
  });

  // Bug kept on purpose (plan V-D4), logged as VD1 in docs/design/voice-decompose-findings.md: the
  // table key is spelled TYPEFERROR, so a real TypeError never reaches its own sentence. This asserts
  // the correct message and is expected to fail until the key is fixed.
  it.fails("VD1: a TypeError gets its own sentence", () => {
    expect(normalizeMicrophoneFailure(domError("TypeError"))).toEqual({
      code: "MIC_TYPEERROR",
      message: "麦克风访问失败：麦克风访问参数被系统拒绝",
    });
  });

  it("uses the generic reason for an unknown error name and keeps its name as the code", () => {
    expect(normalizeMicrophoneFailure(domError("WeirdError"))).toEqual({
      code: "MIC_WEIRDERROR",
      message: "麦克风访问失败：麦克风不可用，请检查浏览器权限与音频设备",
    });
  });

  it("reports MIC_UNAVAILABLE for a value that is not an Error", () => {
    expect(normalizeMicrophoneFailure("nope")).toEqual({
      code: "MIC_UNAVAILABLE",
      message: "麦克风访问失败：麦克风不可用，请检查浏览器权限与音频设备",
    });
    expect(normalizeMicrophoneFailure(domError("")).code).toBe("MIC_UNAVAILABLE");
  });

  it("truncates a long error name to 40 characters", () => {
    expect(normalizeMicrophoneFailure(domError("E".repeat(100))).code).toBe(`MIC_${"E".repeat(40)}`);
  });
});

describe("CONNECTION_FAILURE_MESSAGES", () => {
  it("has a non-empty message for every code and uses only normalized code keys", () => {
    for (const [code, message] of Object.entries(CONNECTION_FAILURE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
      expect(safeClientErrorCode(code)).toBe(code);
    }
  });

  it("explains the codes the aliases map to", () => {
    for (const alias of ["PASSWORD_REQUIRED", "INVALID_PASSWORD", "AUTHENTICATION_FAILED", "GATEWAY_FULL", "TS_CONNECT_FAILED", "ADMIN-TERMINATED"]) {
      expect(CONNECTION_FAILURE_MESSAGES[normalizedClientErrorCode(alias)]).toBeTruthy();
    }
  });

  it("shares the nickname message with INVALID_NICKNAME", () => {
    expect(CONNECTION_FAILURE_MESSAGES.INVALID_NICKNAME).toBe(NICKNAME_LENGTH_MESSAGE);
  });
});
