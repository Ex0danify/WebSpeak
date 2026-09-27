import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import knownGaps from "./known-gaps.json";
import { translations as commonTranslations } from "./common/index";
import { translations as joinTranslations } from "./join/index";
import { translations as roomTranslations } from "./room/index";
import { translations as adminTranslations } from "./admin/index";
import { translations as demoTranslations } from "./demo/index";

// Test version of `npm run check:i18n` (web/scripts/check-i18n.mjs). It scans the language
// files as text, the same way, because `join`, `room` and `admin` start from `...en` (per
// module) and so hold every key that module declares in English at runtime: only the text
// shows what they translate themselves. `common` and `demo` do not spread and are fully
// standalone in all five languages. Every module folder is checked (step 8.7 widened this
// from join/room only, once step 8.6 had resolved the cross-module collisions that made
// checking admin/demo alongside join/room premature — see check-i18n.mjs and the plan's
// Track 8 notes).

const LANGUAGES = ["zh", "en", "de", "ru", "ja"] as const;
type Language = (typeof LANGUAGES)[number];
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

const i18nDir = import.meta.dirname;
const modules = ["common", "join", "room", "admin", "demo"] as const;
type Module = (typeof modules)[number];

const translationsByModule: Record<Module, Record<Language, Record<string, string>>> = {
  common: commonTranslations,
  join: joinTranslations,
  room: roomTranslations,
  admin: adminTranslations,
  demo: demoTranslations,
} as Record<Module, Record<Language, Record<string, string>>>;

function declaredKeys(module: Module, language: Language): Set<string> {
  const source = readFileSync(join(i18nDir, module, `${language}.ts`), "utf8");
  return new Set([...source.matchAll(KEY)].map((match) => (match[1] ?? match[2])!));
}

// module -> language -> declared keys
const declaredByModule = Object.fromEntries(modules.map((module) => [
  module,
  Object.fromEntries(LANGUAGES.map((language) => [language, declaredKeys(module, language)])),
])) as Record<Module, Record<Language, Set<string>>>;

// module -> union of keys declared by any language in that module
const unionByModule = Object.fromEntries(modules.map((module) => [
  module,
  new Set(LANGUAGES.flatMap((language) => [...declaredByModule[module][language]])),
])) as Record<Module, Set<string>>;

const allowed = knownGaps as Partial<Record<Module, Partial<Record<Language, string[]>>>>;

/** Keys another language declares for this module that this one does not, sorted. */
function missingKeys(module: Module, language: Language): string[] {
  return [...unionByModule[module]].filter((key) => !declaredByModule[module][language].has(key)).sort();
}

describe("module discovery", () => {
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

  it.each(["join", "room", "admin"] as const)("%s: de, ru and ja hold every English key at runtime through the spread", (module) => {
    for (const language of ["de", "ru", "ja"] as const) {
      for (const key of declaredByModule[module].en) expect(translationsByModule[module][language]).toHaveProperty(key);
    }
  });

  it.each(["common", "demo"] as const)("%s: every language finds exactly the runtime keys, none spread another file", (module) => {
    for (const language of LANGUAGES) {
      expect([...declaredByModule[module][language]].sort()).toEqual(Object.keys(translationsByModule[module][language]).sort());
    }
  });

  it("reads quoted keys as well as bare ones", () => {
    const sample = ['  plain: "a",', '  "quoted-key": "b",', '    nested: "c",'].join("\n");
    const keys = [...sample.matchAll(KEY)].map((match) => match[1] ?? match[2]);
    expect(keys).toEqual(["plain", "quoted-key"]);
  });
});

describe("translation key parity", () => {
  it.each(modules.flatMap((module) => LANGUAGES.map((language) => [module, language] as const)))(
    "%s/%s: the missing keys are exactly the known gaps",
    (module, language) => {
      const missing = missingKeys(module, language);
      const known = allowed[module]?.[language] ?? [];
      const added = missing.filter((key) => !known.includes(key));
      const fixed = known.filter((key) => !missing.includes(key));
      // Two separate messages so the failure says what to do.
      expect(added, `${module}/${language}: new missing keys, translate them instead of adding them to known-gaps.json`).toEqual([]);
      expect(fixed, `${module}/${language}: keys that are translated now, remove them from known-gaps.json`).toEqual([]);
    },
  );

  it("known-gaps.json is sorted, has no duplicates and names only modules and languages we ship", () => {
    for (const [module, byLanguage] of Object.entries(allowed)) {
      expect(modules).toContain(module);
      for (const [language, keys] of Object.entries(byLanguage ?? {})) {
        expect(LANGUAGES).toContain(language);
        expect(keys).toEqual([...new Set(keys)].sort());
        expect(keys!.length).toBeGreaterThan(0);
      }
    }
  });
});
