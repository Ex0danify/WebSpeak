import { safeClientErrorCode } from "@/features/session";

/**
 * Browsers only hand out a DOMException name for getUserMedia failures (and an
 * often-English message that used to reach the UI verbatim). Map every name the
 * browsers actually raise to a sentence the user can act on, and keep the
 * DOMException name as the stable failure code.
 */
const MICROPHONE_FAILURE_REASONS: Record<string, string> = {
  NOTALLOWEDERROR: "浏览器未授予麦克风权限",
  PERMISSIONDENIEDERROR: "浏览器未授予麦克风权限",
  PERMISSION_DISMISSED: "浏览器未授予麦克风权限",
  SECURITYERROR: "浏览器阻止了麦克风访问",
  NOTFOUNDERROR: "未找到可用的麦克风",
  DEVICESNOTFOUNDERROR: "未找到可用的麦克风",
  OVERCONSTRAINEDERROR: "所选麦克风当前不可用",
  NOTREADABLEERROR: "麦克风可能正被其他程序占用",
  TRACKSTARTERROR: "麦克风可能正被其他程序占用",
  ABORTERROR: "麦克风启动被中断，请重试",
  INVALIDSTATEERROR: "麦克风启动被中断，请重试",
  TYPEFERROR: "麦克风访问参数被系统拒绝",
};

const MICROPHONE_FAILURE_FALLBACK = "麦克风不可用，请检查浏览器权限与音频设备";

const MICROPHONE_FAILURE_CODE_PREFIX = "MIC_";

/** Turn a getUserMedia / DOMException failure into a stable code plus a readable sentence. */
export function normalizeMicrophoneFailure(error: unknown): { code: string; message: string } {
  const rawName = error instanceof Error ? String(error.name || "") : "";
  const name = safeClientErrorCode(rawName).slice(0, 40);
  const reason = MICROPHONE_FAILURE_REASONS[name] ?? MICROPHONE_FAILURE_FALLBACK;
  return { code: `${MICROPHONE_FAILURE_CODE_PREFIX}${name || "UNAVAILABLE"}`, message: `麦克风访问失败：${reason}` };
}
