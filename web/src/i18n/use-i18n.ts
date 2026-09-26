import { ref } from "vue";
import { translations, type Language } from "./webclient/index.js";

const STORAGE_KEY = "webspeak:language";
const LANGUAGES: readonly Language[] = ["zh", "en", "de", "ru", "ja"];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

function detectLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
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

/** Re-read the stored language. Views that mount later call this because
 *  other views (admin, demo) write the same storage key on their own. */
function loadLanguage() {
  language.value = detectLanguage();
}

/** Set the language and remember it under the shared storage key. */
function setLanguage(next: Language) {
  language.value = next;
  localStorage.setItem(STORAGE_KEY, next);
}

function t(key: string, variables: Record<string, string | number> = {}) {
  let value = translations[language.value][key] ?? translations.en[key] ?? translations.zh[key] ?? key;
  for (const [name, replacement] of Object.entries(variables)) value = value.replaceAll(`{{${name}}}`, String(replacement));
  return value;
}

export function useI18n() {
  return { language, loadLanguage, setLanguage, t };
}
