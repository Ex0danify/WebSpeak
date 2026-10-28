/** A language code: the name of a `<code>.ts` file in every i18n folder. Open-ended on purpose, a language is added by a file. */
export type Language = string;

/** What a language file says about itself (`export const meta` in `common/<code>.ts`). */
export interface LanguageMeta {
  /** The language's name in itself, shown in the switcher. */
  endonym: string;
  /** BCP 47 tag for `<html lang>`. */
  tag: string;
  /** Locale handed to `Intl`. */
  intl: string;
  flag: string;
}

export interface LanguageInfo extends LanguageMeta {
  code: Language;
}

export const DEFAULT_LANGUAGE = "en";

/** The language codes each i18n module (keyed by its folder) has a file for. */
export type ModuleLanguages = Readonly<Record<string, readonly string[]>>;

/** Every code that has a file in some module, complete or not (check:i18n reports the incomplete ones). */
export function languageCodesFound(modules: ModuleLanguages): string[] {
  return [...new Set(Object.values(modules).flat())].sort((a, b) => a.localeCompare(b));
}

/** The languages every module has a file for (and that say who they are in `meta`), default first, then alphabetical by code.
 *  A language missing from one module is not listed, but `languageCodesFound` still sees it so the checks can fail loudly. */
export function buildLanguages(modules: ModuleLanguages, metas: Readonly<Record<string, LanguageMeta | undefined>>): LanguageInfo[] {
  return languageCodesFound(modules)
    .filter((code) => Object.values(modules).every((codes) => codes.includes(code)) && metas[code])
    .sort((a, b) => (a === DEFAULT_LANGUAGE ? -1 : b === DEFAULT_LANGUAGE ? 1 : a.localeCompare(b)))
    .map((code) => ({ code, ...metas[code]! }));
}

// Every i18n module's index.ts and the shared `meta` of each language. Eager: they are in the main chunk
// anyway (main.ts registers them), and a lazy glob would emit a chunk per language file.
const moduleFiles = import.meta.glob<{ translations: Record<string, unknown> }>("../../**/i18n/**/index.ts", { eager: true });
const metaFiles = import.meta.glob<{ meta?: LanguageMeta }>(["./common/*.ts", "!./common/index.ts"], { eager: true });

export const MODULE_LANGUAGES: ModuleLanguages = Object.fromEntries(
  Object.entries(moduleFiles).map(([path, module]) => [path, Object.keys(module.translations)]),
);

const metas: Record<string, LanguageMeta | undefined> = Object.fromEntries(
  Object.entries(metaFiles).map(([path, module]) => [path.slice("./common/".length, -3), module.meta]),
);

export const LANGUAGES: readonly LanguageInfo[] = buildLanguages(MODULE_LANGUAGES, metas);

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]!;
}

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.code === value);
}

/** The `Intl` locale of a language (`de-DE` for `de`). */
export function intlLocale(code: string): string {
  return languageInfo(code).intl;
}
