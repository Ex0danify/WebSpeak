export type BanPreset = "hour" | "day" | "week" | "month" | "permanent" | "custom";
export type BanUnit = "minutes" | "hours" | "days";

export const BAN_PRESETS: readonly BanPreset[] = ["hour", "day", "week", "month", "permanent", "custom"];
export const BAN_UNITS: readonly BanUnit[] = ["minutes", "hours", "days"];

/** What a preset lasts, for the ones that last a fixed time. */
export const PRESET_SECONDS = { hour: 3600, day: 86400, week: 604800, month: 2592000 } as const;
const UNIT_SECONDS: Record<BanUnit, number> = { minutes: 60, hours: 3600, days: 86400 };

/** The server counts a ban in 32 bits of seconds. */
export const MAX_BAN_SECONDS = 2 ** 32 - 1;

export interface BanChoice {
  preset: BanPreset;
  /** Only read for a custom length. */
  amount: number;
  unit: BanUnit;
}

/** The seconds a ban lasts, 0 for good, or null while a custom length is not one the server takes. */
export function banSeconds({ preset, amount, unit }: BanChoice): number | null {
  if (preset === "permanent") return 0;
  if (preset !== "custom") return PRESET_SECONDS[preset];
  if (!Number.isInteger(amount) || amount < 1) return null;
  const seconds = amount * UNIT_SECONDS[unit];
  return seconds <= MAX_BAN_SECONDS ? seconds : null;
}
