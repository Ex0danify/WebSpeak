import { ref, watch } from "vue";
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguage, languageInfo, type Language } from "@/shared/i18n/languages.js";
import type { MessageKey } from "@/shared/i18n/messageKeys.js";
import { readStorage, writeStorage } from "@/shared/services/safeStorage.js";

const STORAGE_KEY = "webspeak:language";

type Messages = Record<string, Record<string, string>>;

// Screens own their translation modules and register them at startup (main.ts, the Vitest setup file), so this file imports no
// screen. A key lives in exactly one module, so t() tries each in registration order instead of merging into a copy that goes
// stale when a test adds to a source object. Register `common` first.
const registry: Messages[] = [];

/** Add a translation module (one object per language) to the lookup. Registering the same object twice is a no-op. */
export function registerMessages(messages: Messages): void {
  if (registry.includes(messages)) return;
  registry.push(messages);
  applyDocumentText();
}

function lookup(language: Language, key: string): string | undefined {
  for (const messages of registry) {
    const value = messages[language]?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

export { isLanguage };

/** The browser's preferred languages in order, falling back to the single `navigator.language`. */
function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/**
 * The stored language, else the first browser language a discovered language matches (by primary subtag, so `de-AT` is
 * `de`), else English.
 */
export function detectLanguage(): Language {
  const stored = readStorage(STORAGE_KEY);
  if (isLanguage(stored)) return stored;
  for (const tag of browserLanguages()) {
    const primary = tag.toLowerCase().split("-")[0];
    const match = LANGUAGES.find(({ code }) => code.toLowerCase() === primary);
    if (match) return match.code;
  }
  return DEFAULT_LANGUAGE;
}

// One language for the whole app, so every component that calls useI18n() follows the same switch.
const language = ref<Language>(detectLanguage());

/** Keep `<html lang>` on the page language (screen readers, hyphenation, translation offers). Synchronous, so every way of
 *  changing `language` is covered and the startup value applies at once. */
function applyDocumentLanguage(value: Language) {
  if (typeof document !== "undefined") document.documentElement.lang = languageInfo(value).tag;
}
applyDocumentLanguage(language.value);
watch(language, applyDocumentLanguage, { flush: "sync" });

/**
 * The admin-configured site name, empty while the default is in use. It wins over the translated app title, as in the join
 * page header.
 */
const siteTitle = ref("");
const DEFAULT_SITE_NAME = "WebSpeak";

/**
 * Tab title and description meta in the active language. Runs again when a module registers, the first call is before
 * main.ts registers any text.
 */
function applyDocumentText() {
  if (typeof document === "undefined" || registry.length === 0) return;
  document.title = siteTitle.value || t("appTitle");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("appDescription"));
}
watch([language, siteTitle], applyDocumentText, { flush: "sync" });

/** Let the public config's site name replace the app title in the tab. The default name counts as "not set". */
function setSiteName(name: string) {
  const trimmed = name.trim();
  siteTitle.value = trimmed && trimmed !== DEFAULT_SITE_NAME ? trimmed : "";
}

/** Re-read the stored language. Views that mount later call this because other views (admin, demo) write the same key. */
function loadLanguage() {
  language.value = detectLanguage();
}

/** Set the language and remember it under the shared storage key. */
function setLanguage(next: Language) {
  language.value = next;
  writeStorage(STORAGE_KEY, next);
}

function t(key: MessageKey, variables: Record<string, string | number> = {}): string {
  let value: string = lookup(language.value, key) ?? lookup(DEFAULT_LANGUAGE, key) ?? key;
  for (const [name, replacement] of Object.entries(variables)) value = value.replaceAll(`{{${name}}}`, () => String(replacement));
  return value;
}

export function useI18n() {
  return { language, loadLanguage, setLanguage, setSiteName, t };
}
