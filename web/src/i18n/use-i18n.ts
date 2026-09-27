import { ref, watch } from "vue";
import { translations, type Language } from "./webclient/index.js";
import { readStorage, writeStorage } from "../lib/safe-storage.js";

const STORAGE_KEY = "webspeak:language";
const LANGUAGES: readonly Language[] = ["zh", "en", "de", "ru", "ja"];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** The stored language, else the browser's, else English. The join page, the admin console and the demo page
 *  all start from this one function. */
export function detectLanguage(): Language {
  const stored = readStorage(STORAGE_KEY);
  if (isLanguage(stored)) return stored;
  if (typeof navigator !== "undefined") {
    const browser = navigator.language.toLowerCase();
    for (const language of ["zh", "de", "ru", "ja"] as const) {
      if (browser.startsWith(language)) return language;
    }
  }
  return "en";
}

// One language for the whole app, so every component that calls useI18n()
// follows the same switch.
const language = ref<Language>(detectLanguage());

/** The BCP 47 tag of the document for each language (`zh-CN` for Chinese). */
const DOCUMENT_LANGUAGE: Record<Language, string> = { zh: "zh-CN", en: "en", de: "de", ru: "ru", ja: "ja" };

/** Keep `<html lang>` on the language of the page (screen readers, hyphenation, translation offers).
 *  Synchronous, so every way of changing `language` (setLanguage, loadLanguage, the server-side
 *  preference in WebClient.vue) is covered, and the startup value is applied at once. */
function applyDocumentLanguage(value: Language) {
  if (typeof document !== "undefined") document.documentElement.lang = DOCUMENT_LANGUAGE[value];
}
applyDocumentLanguage(language.value);
watch(language, applyDocumentLanguage, { flush: "sync" });

/** Re-read the stored language. Views that mount later call this because
 *  other views (admin, demo) write the same storage key on their own. */
function loadLanguage() {
  language.value = detectLanguage();
}

/** Set the language and remember it under the shared storage key. */
function setLanguage(next: Language) {
  language.value = next;
  writeStorage(STORAGE_KEY, next);
}

function t(key: string, variables: Record<string, string | number> = {}) {
  let value = translations[language.value][key] ?? translations.en[key] ?? translations.zh[key] ?? key;
  for (const [name, replacement] of Object.entries(variables)) value = value.replaceAll(`{{${name}}}`, () => String(replacement));
  return value;
}

export function useI18n() {
  return { language, loadLanguage, setLanguage, t };
}
