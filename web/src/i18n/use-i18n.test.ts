import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `language` is module state that is read once at import, so each test loads a
// fresh copy of the module after it has set up storage and the browser language.
// The fresh graph has its own `translations`, so it is returned for tests that edit it.
async function load(options: { stored?: string; browser?: string } = {}) {
  localStorage.clear();
  if (options.stored !== undefined) localStorage.setItem("webspeak:language", options.stored);
  vi.spyOn(navigator, "language", "get").mockReturnValue(options.browser ?? "en-US");
  vi.resetModules();
  const [i18n, { translations }] = await Promise.all([import("./use-i18n"), import("./common/index")]);
  return { ...i18n, translations };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("language detection", () => {
  it("uses the stored language over the browser language", async () => {
    const { useI18n } = await load({ stored: "ru", browser: "de-DE" });
    expect(useI18n().language.value).toBe("ru");
  });

  it.each([
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["de-AT", "de"],
    ["DE", "de"],
    ["ru-RU", "ru"],
    ["ja-JP", "ja"],
  ])("maps the browser language %s to %s when nothing is stored", async (browser, expected) => {
    const { useI18n } = await load({ browser });
    expect(useI18n().language.value).toBe(expected);
  });

  it.each(["en-US", "fr-FR", "es", ""])("falls back to English for the browser language '%s'", async (browser) => {
    const { useI18n } = await load({ browser });
    expect(useI18n().language.value).toBe("en");
  });

  it.each(["fr", "EN", "zh-CN", "", "null"])("ignores an invalid stored value '%s'", async (stored) => {
    const { useI18n } = await load({ stored, browser: "de-DE" });
    expect(useI18n().language.value).toBe("de");
  });
});

describe("isLanguage", () => {
  it("accepts the five supported languages and nothing else", async () => {
    const { isLanguage } = await load();
    for (const language of ["zh", "en", "de", "ru", "ja"]) expect(isLanguage(language)).toBe(true);
    for (const value of ["fr", "EN", "", null, undefined, 1, {}]) expect(isLanguage(value)).toBe(false);
  });
});

describe("setLanguage and loadLanguage", () => {
  it("persists the choice under webspeak:language", async () => {
    const { useI18n } = await load();
    useI18n().setLanguage("ja");
    expect(useI18n().language.value).toBe("ja");
    expect(localStorage.getItem("webspeak:language")).toBe("ja");
  });

  it("a later import restores what setLanguage stored", async () => {
    const first = await load();
    first.useI18n().setLanguage("de");
    vi.resetModules();
    const second = await import("./use-i18n");
    expect(second.useI18n().language.value).toBe("de");
  });

  it("is one shared state for every caller of useI18n", async () => {
    const { useI18n, translations } = await load();
    const a = useI18n();
    const b = useI18n();
    a.setLanguage("zh");
    expect(b.language.value).toBe("zh");
    expect(b.t("themeLight")).toBe(translations.zh.themeLight);
  });

  it("loadLanguage re-reads storage that another view wrote", async () => {
    const { useI18n } = await load({ browser: "en-US" });
    const i18n = useI18n();
    expect(i18n.language.value).toBe("en");
    localStorage.setItem("webspeak:language", "ru");
    expect(i18n.language.value).toBe("en");
    i18n.loadLanguage();
    expect(i18n.language.value).toBe("ru");
  });
});

describe("document language (F27)", () => {
  it.each([
    ["zh", "zh-CN"],
    ["en", "en"],
    ["de", "de"],
    ["ru", "ru"],
    ["ja", "ja"],
  ])("sets html lang for %s at startup", async (stored, tag) => {
    await load({ stored });
    expect(document.documentElement.lang).toBe(tag);
  });

  it("follows setLanguage, loadLanguage and a direct change of the shared ref", async () => {
    const { useI18n } = await load({ browser: "en-US" });
    const i18n = useI18n();
    expect(document.documentElement.lang).toBe("en");
    i18n.setLanguage("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
    localStorage.setItem("webspeak:language", "ru");
    i18n.loadLanguage();
    expect(document.documentElement.lang).toBe("ru");
    i18n.language.value = "de";
    expect(document.documentElement.lang).toBe("de");
  });
});

describe("t", () => {
  const key = "__test_key__";
  it("looks the key up in the active language", async () => {
    const { useI18n, translations } = await load({ stored: "de" });
    expect(useI18n().t("themeLight")).toBe(translations.de.themeLight);
    expect(useI18n().t("themeLight")).not.toBe(translations.en.themeLight);
  });

  it("falls back to English when the active language lacks the key", async () => {
    const { useI18n, translations } = await load({ stored: "de" });
    translations.en[key] = "english text";
    expect(useI18n().t(key)).toBe("english text");
  });

  it("falls back to Chinese when neither the language nor English has the key", async () => {
    const { useI18n, translations } = await load({ stored: "ja" });
    translations.zh[key] = "中文";
    expect(useI18n().t(key)).toBe("中文");
  });

  it("returns the key itself when no language has it", async () => {
    const { useI18n } = await load({ stored: "en" });
    expect(useI18n().t("no.such.key")).toBe("no.such.key");
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
  it("F10: a value containing $& is inserted literally", async () => {
    const { useI18n, translations } = await load({ stored: "en" });
    translations.en[key] = "Hello {{name}}";
    expect(useI18n().t(key, { name: "$& {{name}}" })).toBe("Hello $& {{name}}");
  });

  it.each(["a$&b", "$$", "x$`y", "x$'y", "$1"])("F10: the value %s is inserted as it is", async (value) => {
    const { useI18n, translations } = await load({ stored: "en" });
    translations.en[key] = "Hello {{name}}!";
    expect(useI18n().t(key, { name: value })).toBe(`Hello ${value}!`);
  });

  it("substitutes into the fallback text too", async () => {
    const { useI18n, translations } = await load({ stored: "ru" });
    translations.en[key] = "Room {{n}}";
    expect(useI18n().t(key, { n: 7 })).toBe("Room 7");
  });

  it("follows a language switch on the next call", async () => {
    const { useI18n, translations } = await load({ stored: "en" });
    const i18n = useI18n();
    const english = i18n.t("themeDark");
    i18n.setLanguage("de");
    expect(i18n.t("themeDark")).toBe(translations.de.themeDark);
    expect(i18n.t("themeDark")).not.toBe(english);
  });
});
