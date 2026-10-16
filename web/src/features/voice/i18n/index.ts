import { collectTranslations } from "@/shared/i18n/collectTranslations";

// A language is a file, no line here names one.
const files = import.meta.glob<Record<string, unknown>>(["./*.ts", "!./index.ts", "!./*.test.ts"], { eager: true });

export const translations: Record<string, Record<string, string>> = collectTranslations(files);

// The keys of the default language feed `MessageKey` (shared/i18n/messageKeys.ts).
import type { en } from "@/features/voice/i18n/en";
declare module "@/shared/i18n/messageKeys" {
  interface MessageCatalog extends Record<keyof typeof en, true> {}
}
