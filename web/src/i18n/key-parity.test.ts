import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import knownGaps from "./known-gaps.json";
import { translations } from "./webclient/index";

// Test version of `npm run check:i18n` (web/scripts/check-i18n.mjs). It scans the
// language files as text, the same way, because de, ru and ja start from `...en`
// and so hold every English key at runtime: only the text shows what they
// translate themselves.
//
// The gaps that existed when this test was written are listed in known-gaps.json.
// A new gap fails the test. A fixed gap fails it too, until the key is removed
// from the list, so the list can only shrink. Step 8.1 empties it.

const LANGUAGES = ["zh", "en", "de", "ru", "ja"] as const;
type Language = (typeof LANGUAGES)[number];
const KEY = /^ {2}(?:([A-Za-z_$][\w$]*)|"([^"]+)"):/gm;

function declaredKeys(language: Language): Set<string> {
  const source = readFileSync(join(import.meta.dirname, "webclient", `${language}.ts`), "utf8");
  return new Set([...source.matchAll(KEY)].map((match) => (match[1] ?? match[2])!));
}

const declared = Object.fromEntries(LANGUAGES.map((language) => [language, declaredKeys(language)])) as Record<Language, Set<string>>;
const union = new Set(LANGUAGES.flatMap((language) => [...declared[language]]));
const allowed = knownGaps as Partial<Record<Language, string[]>>;

/** Keys that another language declares and this one does not, sorted. */
function missingKeys(language: Language): string[] {
  return [...union].filter((key) => !declared[language].has(key)).sort();
}

describe("the key scan", () => {
  it.each(["zh", "en"] as const)("finds exactly the runtime keys of %s, which does not spread another file", (language) => {
    expect([...declared[language]].sort()).toEqual(Object.keys(translations[language]).sort());
  });

  it.each(["de", "ru", "ja"] as const)("finds only keys that %s really has at runtime", (language) => {
    for (const key of declared[language]) expect(translations[language]).toHaveProperty(key);
  });

  it("de, ru and ja hold every English key at runtime through the spread", () => {
    for (const language of ["de", "ru", "ja"] as const) {
      for (const key of declared.en) expect(translations[language]).toHaveProperty(key);
    }
  });

  it("reads quoted keys as well as bare ones", () => {
    const sample = ['  plain: "a",', '  "quoted-key": "b",', '    nested: "c",'].join("\n");
    const keys = [...sample.matchAll(KEY)].map((match) => match[1] ?? match[2]);
    expect(keys).toEqual(["plain", "quoted-key"]);
  });
});

describe("translation key parity", () => {
  it.each(LANGUAGES)("%s: the missing keys are exactly the known gaps", (language) => {
    const missing = missingKeys(language);
    const known = allowed[language] ?? [];
    const added = missing.filter((key) => !known.includes(key));
    const fixed = known.filter((key) => !missing.includes(key));
    // Two separate messages so the failure says what to do.
    expect(added, `${language}: new missing keys, translate them instead of adding them to known-gaps.json`).toEqual([]);
    expect(fixed, `${language}: keys that are translated now, remove them from known-gaps.json`).toEqual([]);
  });

  it("known-gaps.json is sorted, has no duplicates and names only languages we ship", () => {
    for (const [language, keys] of Object.entries(allowed)) {
      expect(LANGUAGES).toContain(language);
      expect(keys).toEqual([...new Set(keys)].sort());
      expect(keys!.length).toBeGreaterThan(0);
    }
  });
});
