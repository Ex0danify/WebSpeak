import { intlLocale, type Language } from "../i18n/languages.js";
import { createFormat } from "../i18n/useFormat.js";

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

// Fixed pastel identity colors picked by nickname hash. A user must keep the same
// color in every theme, so they cannot be theme tokens (see style-budget.json).
const avatarColors = ["#9edbd4", "#b9d4c5", "#e8c6a8", "#c5c7e8", "#edd2d4", "#c8d9e9", "#e4d3b8"];

export function avatarStyle(name: string, isSelf = false, avatar = ""): Record<string, string> {
  const fallback = isSelf ? "linear-gradient(135deg, var(--ws-accent), color-mix(in srgb, var(--ws-accent) 75%, var(--ws-fg)))" : "";
  let hash = 0;
  for (let index = 0; index < name.length; index++) hash = name.charCodeAt(index) + ((hash << 5) - hash);
  return {
    background: fallback || avatarColors[Math.abs(hash) % avatarColors.length],
    ...(avatar ? { backgroundImage: `url("${avatar}")`, backgroundPosition: "center", backgroundSize: "cover" } : {}),
  };
}

export function formatTime(timestamp: number, language: Language): string {
  return createFormat(intlLocale(language)).time(timestamp);
}
