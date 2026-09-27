import type { Language } from "../i18n/room/index.js";

export function median(values: number[]): number | null {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

export function serverKey(address: string): string {
  return address.trim().toLocaleLowerCase();
}

export function avatarInitial(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

export function formatTime(timestamp: number, language: Language): string {
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "ru" ? "ru-RU" : language === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

export function microphoneErrorMessage(error: unknown, fallback = "请检查浏览器权限") {
  const name = error instanceof DOMException ? error.name : "";
  const reasons: Record<string, string> = {
    NotAllowedError: "浏览器未授予麦克风权限",
    NotFoundError: "未找到可用的麦克风",
    NotReadableError: "麦克风可能正被其他程序占用",
    OverconstrainedError: "所选麦克风当前不可用",
    SecurityError: "浏览器阻止了麦克风访问",
  };
  return `麦克风访问失败：${reasons[name] ?? fallback}`;
}
