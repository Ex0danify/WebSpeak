import { collectTranslations } from "@/shared/i18n/collectTranslations.js";

export type { Language } from "@/shared/i18n/languages.js";

// A language is a file, no line here names one. Each file also exports `meta`, read by languages.ts.
const files = import.meta.glob<Record<string, unknown>>(["./*.ts", "!./index.ts", "!./*.test.ts"], { eager: true });

export const translations: Record<string, Record<string, string>> = collectTranslations(files);

// The keys of the default language feed `MessageKey` (shared/i18n/messageKeys.ts).
import type { en } from "@/shared/i18n/common/en";
declare module "@/shared/i18n/messageKeys" {
  interface MessageCatalog extends Record<keyof typeof en, true> {}
}
