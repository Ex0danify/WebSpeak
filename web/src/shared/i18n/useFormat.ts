import { intlLocale } from "@/shared/i18n/languages.js";
import { useI18n } from "@/shared/i18n/useI18n.js";

export type UnitStyle = "long" | "short" | "narrow";

export interface DurationOptions {
  style?: UnitStyle;
  /** How many of the largest non-zero units to show (default 2: "1h 5m"). */
  maxParts?: number;
}

export interface UnitOptions {
  style?: UnitStyle;
  maximumFractionDigits?: number;
  /** Shown after the number when `Intl` has no such unit (for example "FPS"). */
  fallback?: string;
}

type DateInput = Date | number | string;

const DURATION_UNITS = [
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
] as const;

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

const cache = new Map<string, unknown>();

// `Intl` constructors are costly; one instance per locale and options serves every call.
function cached<T>(name: string, locale: string, options: object | undefined, make: () => T): T {
  const key = `${name}|${locale}|${JSON.stringify(options ?? {})}`;
  let value = cache.get(key) as T | undefined;
  if (value === undefined) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

/** Locale-aware formatters for one `Intl` locale. `Intl.DurationFormat` is missing from the supported browsers (Chrome 111) and
 *  Node 22, so `duration` composes the parts from `Intl.NumberFormat` units, giving one code path and the same output in tests. */
export function createFormat(locale: string) {
  const dateTime = (options: Intl.DateTimeFormatOptions) => cached("dtf", locale, options, () => new Intl.DateTimeFormat(locale, options));
  const numberFormat = (options: Intl.NumberFormatOptions) => cached("nf", locale, options, () => new Intl.NumberFormat(locale, options));

  function unit(value: number, name: string, { style = "short", maximumFractionDigits, fallback }: UnitOptions = {}): string {
    try {
      return numberFormat({ style: "unit", unit: name, unitDisplay: style, maximumFractionDigits }).format(value);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return `${numberFormat({ maximumFractionDigits }).format(value)} ${fallback ?? name}`;
    }
  }

  return {
    locale,
    date: (value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) => dateTime(options).format(new Date(value)),
    time: (value: DateInput, options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }) =>
      dateTime(options).format(new Date(value)),
    dateTime: (value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) =>
      dateTime(options).format(new Date(value)),
    number: (value: number, options: Intl.NumberFormatOptions = {}) => numberFormat(options).format(value),
    /** `fraction` is 0..1 (0.256 -> "25.6%" with one digit). */
    percent: (fraction: number, maximumFractionDigits = 0) => numberFormat({ style: "percent", maximumFractionDigits }).format(fraction),
    unit,
    duration(totalSeconds: number, { style = "narrow", maxParts = 2 }: DurationOptions = {}): string {
      let rest = Math.max(0, Math.floor(totalSeconds));
      const parts: string[] = [];
      for (const { unit: name, seconds } of DURATION_UNITS) {
        const amount = Math.floor(rest / seconds);
        rest -= amount * seconds;
        if (amount > 0 && parts.length < maxParts) parts.push(unit(amount, name, { style }));
      }
      return parts.length ? parts.join(" ") : unit(0, "second", { style });
    },
    list: (items: string[], type: "conjunction" | "disjunction" = "conjunction") =>
      cached("lf", locale, { type }, () => new Intl.ListFormat(locale, { type, style: "long" })).format(items),
    /** Relative to `now`: "5 minutes ago", "in 2 hours". Picks the largest unit that fits. */
    relative(value: DateInput, now: DateInput = Date.now()): string {
      const delta = (new Date(value).getTime() - new Date(now).getTime()) / 1000;
      const { unit: name, seconds } =
        RELATIVE_UNITS.find(({ seconds }) => Math.abs(delta) >= seconds) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1]!;
      return cached("rtf", locale, { numeric: "auto" }, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" })).format(
        Math.trunc(delta / seconds),
        name,
      );
    },
  };
}

export type Format = ReturnType<typeof createFormat>;

/** The formatters of the active language. Each call reads the shared `language` ref, so a template or
 *  computed using them re-renders on a language switch. */
export function useFormat(): Format {
  const { language } = useI18n();
  const current = () => createFormat(intlLocale(language.value));
  return {
    get locale() {
      return current().locale;
    },
    date: (...args) => current().date(...args),
    time: (...args) => current().time(...args),
    dateTime: (...args) => current().dateTime(...args),
    number: (...args) => current().number(...args),
    percent: (...args) => current().percent(...args),
    unit: (...args) => current().unit(...args),
    duration: (...args) => current().duration(...args),
    list: (...args) => current().list(...args),
    relative: (...args) => current().relative(...args),
  };
}
