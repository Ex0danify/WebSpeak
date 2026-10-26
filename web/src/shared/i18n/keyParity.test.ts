import { describe, expect, it } from "vitest";
import { isCjkLanguage } from "@/shared/i18n/cjkLanguages";
import { LANGUAGES as DISCOVERED, MODULE_LANGUAGES, languageCodesFound } from "@/shared/i18n/languages";

// Test version of `npm run check:i18n`, scanning the language files as text because `join`, `room` and `admin` start from
// `...en`, so only the text shows what they translate themselves. Modules are found by glob (a folder under src/ with an
// index.ts and the language files).

// The languages come from the folders (languages.ts), nothing here names one.
const LANGUAGES = DISCOVERED.map((language) => language.code);
type Language = string;
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

type Translations = Record<Language, Record<string, string>>;

const indexFiles = import.meta.glob<{ translations: Translations }>("@/**/i18n/**/index.ts", { eager: true });
const sourceFiles = import.meta.glob<string>(["@/**/i18n/**/*.ts", "!@/**/i18n/**/index.ts", "!@/**/i18n/**/*.test.ts"], {
  eager: true,
  query: "?raw",
  import: "default",
});

const moduleDirs = new Map<string, string>();
for (const path of Object.keys(indexFiles)) {
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (!/(^|\/)i18n(\/|$)/.test(`${dir}/`)) continue;
  const parts = dir.split("/");
  const name = parts.at(-1) === "i18n" ? parts.at(-2)! : parts.at(-1)!;
  expect(moduleDirs.has(name), `two i18n modules are both named "${name}"`).toBe(false);
  moduleDirs.set(name, dir);
}

const modules = [...moduleDirs.keys()].sort();
type Module = string;

const translationsByModule: Record<Module, Translations> = Object.fromEntries(
  modules.map((module) => [module, indexFiles[`${moduleDirs.get(module)}/index.ts`]!.translations]),
);

function declaredKeys(module: Module, language: Language): Set<string> {
  const source = sourceFiles[`${moduleDirs.get(module)}/${language}.ts`]!;
  return new Set([...source.matchAll(KEY)].map((match) => (match[1] ?? match[2])!));
}

const declaredByModule = Object.fromEntries(
  modules.map((module) => [module, Object.fromEntries(LANGUAGES.map((language) => [language, declaredKeys(module, language)]))]),
) as Record<Module, Record<Language, Set<string>>>;

const unionByModule = Object.fromEntries(
  modules.map((module) => [module, new Set(LANGUAGES.flatMap((language) => [...declaredByModule[module][language]]))]),
) as Record<Module, Set<string>>;

/** Keys another language declares for this module that this one does not, sorted. */
function missingKeys(module: Module, language: Language): string[] {
  return [...unionByModule[module]].filter((key) => !declaredByModule[module][language].has(key)).sort();
}

describe("language discovery", () => {
  it("lists a language only when it is complete, and no language file is stranded in one folder", () => {
    expect(languageCodesFound(MODULE_LANGUAGES)).toEqual([...LANGUAGES].sort());
    for (const dir of moduleDirs.values())
      for (const language of LANGUAGES) expect(sourceFiles, `${dir} has no ${language}.ts`).toHaveProperty([`${dir}/${language}.ts`]);
  });

  it("puts the default language first", () => {
    expect(LANGUAGES[0]).toBe("en");
  });
});

describe("module discovery", () => {
  it("finds the modules we ship", () => {
    expect(modules).toEqual(expect.arrayContaining(["common", "join", "room", "admin", "demo"]));
  });

  it("declares each key in exactly one module, per language", () => {
    for (const language of LANGUAGES) {
      const seenIn = new Map<string, Module>();
      for (const module of modules) {
        for (const key of declaredByModule[module][language]) {
          expect(seenIn.has(key), `"${key}" (${language}) is declared in both ${seenIn.get(key)}/ and ${module}/`).toBe(false);
          seenIn.set(key, module);
        }
      }
    }
  });
});

describe("the key scan", () => {
  it.each(modules.flatMap((module) => LANGUAGES.map((language) => [module, language] as const)))(
    "finds only keys that %s/%s really has at runtime",
    (module, language) => {
      for (const key of declaredByModule[module][language]) expect(translationsByModule[module][language]).toHaveProperty(key);
    },
  );

  // `de` is strict, no spread, so a key it lacks is really absent and t() falls back to `en`.
  it.each(modules.filter((module) => ["common", "demo", "join", "room", "admin", "session", "screenShare", "chat"].includes(module)))(
    "%s: de finds exactly the runtime keys, none spread another file",
    (module) => {
      expect([...declaredByModule[module].de].sort()).toEqual(Object.keys(translationsByModule[module].de).sort());
    },
  );

  it.each(modules.filter((module) => ["common", "demo"].includes(module)))(
    "%s: every language finds exactly the runtime keys, none spread another file",
    (module) => {
      for (const language of LANGUAGES) {
        expect([...declaredByModule[module][language]].sort()).toEqual(Object.keys(translationsByModule[module][language]).sort());
      }
    },
  );

  it("reads quoted keys as well as bare ones", () => {
    const sample = ['  plain: "a",', '  "quoted-key": "b",', '    nested: "c",'].join("\n");
    const keys = [...sample.matchAll(KEY)].map((match) => match[1] ?? match[2]);
    expect(keys).toEqual(["plain", "quoted-key"]);
  });
});

describe("translation key parity", () => {
  it.each(modules.flatMap((module) => LANGUAGES.map((language) => [module, language] as const)))(
    "%s/%s: declares every key the module declares in any language",
    (module, language) => {
      expect(missingKeys(module, language), `${module}/${language}: missing keys, translate them`).toEqual([]);
    },
  );
});

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
const CJK = /[\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3190-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const placeholdersOf = (value: string) => [...new Set([...value.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();

/** Non-default-language values that may equal their English text (brand names, units, loanwords that are the same in German).
 *  Each entry is `module.key` and a new one needs a reason in review. */
const SAME_AS_ENGLISH = new Set<string>([
  "admin.dashboard",
  "admin.gateway",
  "admin.status",
  "admin.version",
  "admin.web",
  "admin.webrtcSettings",
  "demo.simulated",
  "demo.demoOnline",
  "join.browserSupport",
  "identity.identityNameLabel",
  "chat.serverChat",
  "room.serverBreadcrumb",
  "room.onlineShort",
  "room.memberOnline",
  "room.optimal",
  "room.mobileChat",
  "room.browser",
  "room.browserToGateway",
  "room.gatewayToTeamSpeak",
  "room.screenShareRtt",
  "room.teamSpeakServer",
  "room.webSpeakGateway",
  "common.optional",
  "common.serverPortPlaceholder",
  "common.server",
]);

const defaultLanguage = LANGUAGES[0]!;
const otherLanguages = LANGUAGES.slice(1);

describe("value rules", () => {
  it.each(modules)("%s: every language uses the same {{placeholders}} as English, per key", (module) => {
    const base = translationsByModule[module][defaultLanguage];
    for (const language of otherLanguages) {
      for (const [key, value] of Object.entries(translationsByModule[module][language])) {
        if (base[key] === undefined) continue;
        expect(placeholdersOf(value), `${module}/${language}/${key}`).toEqual(placeholdersOf(base[key]));
      }
    }
  });

  it.each(modules)("%s: no value of a non-CJK language contains a CJK character", (module) => {
    for (const language of LANGUAGES.filter((code) => !isCjkLanguage(code))) {
      for (const [key, value] of Object.entries(translationsByModule[module][language])) {
        expect(CJK.test(value), `${module}/${language}/${key} contains CJK text`).toBe(false);
      }
    }
  });

  it.each(modules)("%s: no other language repeats the English text unless allowlisted", (module) => {
    const base = translationsByModule[module][defaultLanguage];
    for (const language of otherLanguages) {
      for (const [key, value] of Object.entries(translationsByModule[module][language])) {
        if (SAME_AS_ENGLISH.has(`${module}.${key}`)) continue;
        expect(
          value === base[key],
          `${module}/${language}/${key} equals its English text (untranslated, or add "${module}.${key}" to SAME_AS_ENGLISH)`,
        ).toBe(false);
      }
    }
  });

  it("allowlists only keys that exist and really equal their English text", () => {
    for (const entry of SAME_AS_ENGLISH) {
      const [module, key] = [entry.slice(0, entry.indexOf(".")), entry.slice(entry.indexOf(".") + 1)];
      const base = translationsByModule[module]?.[defaultLanguage]?.[key];
      expect(base, `${entry} is not a key`).toBeDefined();
      expect(
        otherLanguages.some((language) => translationsByModule[module][language][key] === base),
        `${entry} no longer equals English, remove it`,
      ).toBe(true);
    }
  });
});
