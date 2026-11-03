import type { IconName } from "@/shared/ui/icon";

export interface BuiltinGroupIcon {
  icon: IconName;
  /** Text color token, so the glyph keeps its contrast on both themes. */
  tone: string;
}

// TeamSpeak ships its own artwork for these ids. We draw stand-ins from our icon set.
const BUILTIN: Record<number, BuiltinGroupIcon> = {
  100: { icon: "star", tone: "text-warning" },
  200: { icon: "user", tone: "text-accent" },
  300: { icon: "shield", tone: "text-danger" },
  500: { icon: "server", tone: "text-danger" },
  600: { icon: "server", tone: "text-fg-muted" },
};

const GENERIC: BuiltinGroupIcon = { icon: "users", tone: "text-fg-muted" };

/** Ids below 1000 are never files on the server. */
export function builtinGroupIcon(iconId: number): BuiltinGroupIcon | undefined {
  if (!Number.isInteger(iconId) || iconId <= 0 || iconId >= 1000) return undefined;
  return BUILTIN[iconId] ?? GENERIC;
}
