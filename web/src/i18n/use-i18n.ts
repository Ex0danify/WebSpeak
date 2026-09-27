import { ref, watch } from "vue";
import { translations as commonTranslations, type Language } from "./common/index.js";
import { translations as joinTranslations } from "./join/index.js";
import { translations as roomTranslations } from "./room/index.js";
import { translations as adminTranslations } from "./admin/index.js";
import { translations as demoTranslations } from "./demo/index.js";
import { readStorage, writeStorage } from "../lib/safe-storage.js";

const STORAGE_KEY = "webspeak:language";
const LANGUAGES: readonly Language[] = ["zh", "en", "de", "ru", "ja"];

// Step 8.2 split WebClient's one i18n module into `join` (pre-connect screen) and `room`
// (connected view); steps 8.4 and 8.5 folded `admin` and `demo` into the same lookup. A key
// exists in exactly one of these five modules (checked by check-i18n.mjs and
// key-parity.test.ts for join/room; step 8.6's scan confirmed it by hand for all four), so
// t() below tries each module in turn instead of merging them into a copy: a copy would stop
// seeing a translation a test adds to one of the source objects after t() first ran. `common`
// (step 8.6) holds every key two or more views' vocabularies turned out to agree on
// word-for-word; it is checked first since nothing else declares these keys any more, so
// order does not matter for them specifically, but reads better as "shared chrome, then the
// view's own vocabulary". The handful of keys that instead turned out to mean two different
// things under one name (nickname, optionalPassword, adminConsole, packetLoss, and demo's
// back/browserClient/online) were renamed to distinct keys rather than merged — see the
// plan's Track 8 notes.
function lookup(language: Language, key: string): string | undefined {
  return commonTranslations[language][key] ?? roomTranslations[language][key] ?? joinTranslations[language][key] ?? adminTranslations[language][key] ?? demoTranslations[language][key];
}

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
  let value = lookup(language.value, key) ?? lookup("en", key) ?? lookup("zh", key) ?? key;
  for (const [name, replacement] of Object.entries(variables)) value = value.replaceAll(`{{${name}}}`, () => String(replacement));
  return value;
}

export function useI18n() {
  return { language, loadLanguage, setLanguage, t };
}
