import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLanguages, languageCodesFound, type LanguageMeta } from "./languages";

// The acceptance test for "a language is a file": a throwaway `fr` is added to the real folder set as
// nothing but paths plus its `meta`, and must show up everywhere without another edit.
const FR: LanguageMeta = { endonym: "Français", tag: "fr-FR", intl: "fr-FR", flag: "🇫🇷" };

const realModules = (await vi.importActual<typeof import("./languages")>("./languages")).MODULE_LANGUAGES;
const withFrench = Object.fromEntries(Object.entries(realModules).map(([dir, codes]) => [dir, [...codes, "fr"]]));

const realMetas = (await vi.importActual<typeof import("./languages")>("./languages")).LANGUAGES
  .reduce<Record<string, LanguageMeta>>((all, { code, ...meta }) => ({ ...all, [code]: meta }), {});

describe("buildLanguages", () => {
  it("lists the shipped languages, default first, then alphabetical", () => {
    const codes = buildLanguages(realModules, realMetas).map((language) => language.code);
    expect(codes[0]).toBe("en");
    expect(codes.slice(1)).toEqual([...codes.slice(1)].sort());
  });

  it("lists a language once every i18n folder has its file", () => {
    const list = buildLanguages(withFrench, { ...realMetas, fr: FR });
    expect(list.map((language) => language.code)).toContain("fr");
    expect(list.find((language) => language.code === "fr")).toMatchObject({ endonym: "Français", tag: "fr-FR" });
  });

  it("leaves out a language missing from one folder, while the checks can still see it", () => {
    const partial = { ...realModules, [Object.keys(realModules)[0]!]: [...Object.values(realModules)[0]!, "fr"] };
    expect(buildLanguages(partial, { ...realMetas, fr: FR }).map((language) => language.code)).not.toContain("fr");
    expect(languageCodesFound(partial)).toContain("fr");
  });

  it("leaves out a language that has no meta", () => {
    expect(buildLanguages(withFrench, realMetas).map((language) => language.code)).not.toContain("fr");
  });
});

describe("a language added by files only", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.doMock("./languages", async () => {
      const actual = await vi.importActual<typeof import("./languages")>("./languages");
      const list = actual.buildLanguages(withFrench, { ...realMetas, fr: FR });
      return {
        ...actual,
        LANGUAGES: list,
        languageInfo: (code: string) => list.find((language) => language.code === code) ?? list[0],
        isLanguage: (value: unknown) => list.some((language) => language.code === value),
        intlLocale: (code: string) => (list.find((language) => language.code === code) ?? list[0])!.intl,
      };
    });
  });
  afterEach(() => {
    vi.doUnmock("./languages");
    vi.restoreAllMocks();
  });

  it("is accepted, detected, and sets <html lang>", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-CA"]);
    const { useI18n, isLanguage } = await import("./useI18n");
    expect(isLanguage("fr")).toBe(true);
    expect(useI18n().language.value).toBe("fr");
    expect(document.documentElement.lang).toBe("fr-FR");
  });

  it("appears in the switcher", async () => {
    const { default: LanguageSwitcher } = await import("../components/LanguageSwitcher.vue");
    const wrapper = mount(LanguageSwitcher, { props: { modelValue: "fr" }, attachTo: document.body });
    expect(wrapper.text()).toContain("FR");
    await wrapper.find("button").trigger("click");
    expect(document.body.textContent).toContain("Français");
    wrapper.unmount();
  });
});
