// Step V1.2: the microphone failure mapping (split out of errors.test.ts, Step S3.2).
import { describe, expect, it } from "vitest";
import { normalizeMicrophoneFailure } from "./voiceErrors";

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
