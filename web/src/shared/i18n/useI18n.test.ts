import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testKey } from "@/testSupport/testKey";

// `language` is module state that is read once at import, so each test loads a
// fresh copy of the module after it has set up storage and the browser language.
// The fresh graph has its own `translations`, so it is returned for tests that edit it.
async function load(options: { stored?: string; browser?: string; languages?: string[] } = {}) {
  localStorage.clear();
  if (options.stored !== undefined) localStorage.setItem("webspeak:language", options.stored);
  const browser = options.browser ?? options.languages?.[0] ?? "en-US";
  vi.spyOn(navigator, "language", "get").mockReturnValue(browser);
  vi.spyOn(navigator, "languages", "get").mockReturnValue(options.languages ?? (browser ? [browser] : []));
  vi.resetModules();
  const [i18n, { translations }] = await Promise.all([import("@/shared/i18n/useI18n"), import("@/shared/i18n/common/index")]);
  i18n.registerMessages(translations);
  return { ...i18n, translations };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("language detection", () => {
  it("uses the stored language over the browser language", async () => {
    const { useI18n } = await load({ stored: "en", browser: "de-DE" });
    expect(useI18n().language.value).toBe("en");
  });

  it.each([
    ["de-AT", "de"],
    ["DE", "de"],
  ])("maps the browser language %s to %s when nothing is stored", async (browser, expected) => {
    const { useI18n } = await load({ browser });
    expect(useI18n().language.value).toBe(expected);
  });

  it.each(["en-US", "fr-FR", "es", "zh-CN", "ru-RU", "ja-JP", ""])(
    "falls back to English for the browser language '%s'",
    async (browser) => {
      const { useI18n } = await load({ browser });
      expect(useI18n().language.value).toBe("en");
    },
  );

  it.each([
    [["fr-FR", "de", "en"], "de"],
    [["zh-CN", "ja", "de-AT"], "de"],
    [["en-US", "de"], "en"],
    [["fr-FR", "zh-CN", "ja"], "en"],
    [[], "en"],
  ])("walks the browser language list %j and picks %s", async (languages, expected) => {
    const { useI18n } = await load({ languages });
    expect(useI18n().language.value).toBe(expected);
  });

  it("matches the primary subtag, not a prefix", async () => {
    const { useI18n } = await load({ languages: ["den-XX"] });
    expect(useI18n().language.value).toBe("en");
  });

  it.each(["fr", "EN", "zh-CN", "", "null", "zh", "ru", "ja"])("ignores an invalid or retired stored value '%s'", async (stored) => {
    const { useI18n } = await load({ stored, browser: "de-DE" });
    expect(useI18n().language.value).toBe("de");
  });
});

describe("isLanguage", () => {
  it("accepts the two supported languages and nothing else", async () => {
    const { isLanguage } = await load();
    for (const language of ["en", "de"]) expect(isLanguage(language)).toBe(true);
    for (const value of ["fr", "EN", "", null, undefined, 1, {}]) expect(isLanguage(value)).toBe(false);
  });
});

describe("setLanguage and loadLanguage", () => {
  it("persists the choice under webspeak:language", async () => {
    const { useI18n } = await load();
    useI18n().setLanguage("de");
    expect(useI18n().language.value).toBe("de");
    expect(localStorage.getItem("webspeak:language")).toBe("de");
  });

  it("a later import restores what setLanguage stored", async () => {
    const first = await load();
    first.useI18n().setLanguage("de");
    vi.resetModules();
    const second = await import("@/shared/i18n/useI18n");
    expect(second.useI18n().language.value).toBe("de");
  });

  it("is one shared state for every caller of useI18n", async () => {
    const { useI18n, translations } = await load();
    const a = useI18n();
    const b = useI18n();
    a.setLanguage("de");
    expect(b.language.value).toBe("de");
    expect(b.t("close")).toBe(translations.de.close);
  });

  it("loadLanguage re-reads storage that another view wrote", async () => {
    const { useI18n } = await load({ browser: "en-US" });
    const i18n = useI18n();
    expect(i18n.language.value).toBe("en");
    localStorage.setItem("webspeak:language", "de");
    expect(i18n.language.value).toBe("en");
    i18n.loadLanguage();
    expect(i18n.language.value).toBe("de");
  });
});

describe("document language", () => {
  it.each([
    ["en", "en"],
    ["de", "de"],
  ])("sets html lang for %s at startup", async (stored, tag) => {
    await load({ stored });
    expect(document.documentElement.lang).toBe(tag);
  });

  it("follows setLanguage, loadLanguage and a direct change of the shared ref", async () => {
    const { useI18n } = await load({ browser: "en-US" });
    const i18n = useI18n();
    expect(document.documentElement.lang).toBe("en");
    i18n.setLanguage("de");
    expect(document.documentElement.lang).toBe("de");
    localStorage.setItem("webspeak:language", "en");
    i18n.loadLanguage();
    expect(document.documentElement.lang).toBe("en");
    i18n.language.value = "de";
    expect(document.documentElement.lang).toBe("de");
  });
});

describe("document title and description", () => {
  it("follows the language and the site name", async () => {
    document.head.innerHTML = '<meta name="description" content="x">';
    const { useI18n, translations } = await load({ browser: "en-US" });
    const i18n = useI18n();
    expect(document.title).toBe(translations.en.appTitle);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(translations.en.appDescription);
    i18n.setLanguage("de");
    expect(document.title).toBe(translations.de.appTitle);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(translations.de.appDescription);
    i18n.setSiteName("Raid Night");
    expect(document.title).toBe("Raid Night");
    i18n.setSiteName("WebSpeak");
    expect(document.title).toBe(translations.de.appTitle);
  });
});

describe("t", () => {
  const key = testKey("__test_key__");
  it("looks the key up in the active language", async () => {
    const { useI18n, translations } = await load({ stored: "de" });
    expect(useI18n().t("close")).toBe(translations.de.close);
    expect(useI18n().t("close")).not.toBe(translations.en.close);
  });

  it("falls back to English when the active language lacks the key", async () => {
    const { useI18n, translations } = await load({ stored: "de" });
    translations.en[key] = "english text";
    expect(useI18n().t(key)).toBe("english text");
  });

  it("returns the key itself when no language has it", async () => {
    const { useI18n } = await load({ stored: "en" });
    expect(useI18n().t(testKey("no.such.key"))).toBe("no.such.key");
  });

  it("substitutes every occurrence of {{name}}", async () => {
    const { useI18n, translations } = await load({ stored: "en" });
    translations.en[key] = "{{who}} moved to {{where}}, {{who}} is happy";
    expect(useI18n().t(key, { who: "Ann", where: "Lobby" })).toBe("Ann moved to Lobby, Ann is happy");
  });

  it("stringifies numbers and leaves unknown placeholders alone", async () => {
    const { useI18n, translations } = await load({ stored: "en" });
    translations.en[key] = "{{count}} of {{max}} ({{other}})";
    expect(useI18n().t(key, { count: 3, max: 0 })).toBe("3 of 0 ({{other}})");
  });

  // The value is inserted literally: t() passes it as a function, not as a replacement pattern.
  it("a value containing $& is inserted literally", async () => {
    const { useI18n, translations } = await load({ stored: "en" });
    translations.en[key] = "Hello {{name}}";
    expect(useI18n().t(key, { name: "$& {{name}}" })).toBe("Hello $& {{name}}");
  });

  it.each(["a$&b", "$$", "x$`y", "x$'y", "$1"])("the value %s is inserted as it is", async (value) => {
    const { useI18n, translations } = await load({ stored: "en" });
    translations.en[key] = "Hello {{name}}!";
    expect(useI18n().t(key, { name: value })).toBe(`Hello ${value}!`);
  });

  it("substitutes into the fallback text too", async () => {
    const { useI18n, translations } = await load({ stored: "de" });
    translations.en[key] = "Room {{n}}";
    expect(useI18n().t(key, { n: 7 })).toBe("Room 7");
  });

  it("follows a language switch on the next call", async () => {
    const { useI18n, translations } = await load({ stored: "en" });
    const i18n = useI18n();
    const english = i18n.t("send");
    i18n.setLanguage("de");
    expect(i18n.t("send")).toBe(translations.de.send);
    expect(i18n.t("send")).not.toBe(english);
  });
});
