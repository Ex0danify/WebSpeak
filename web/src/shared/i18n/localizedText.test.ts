import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { registerMessages, useI18n } from "./useI18n";
import { LocalizedError, errorText, isLocalizedText, resolveText, text } from "./localizedText";
import { testKey } from "@/testSupport/testKey";

const messages = {
  en: { lt_hello: "Hello {{name}}", lt_plain: "Plain", lt_flag: "Flag {{on}}" },
  de: { lt_hello: "Hallo {{name}}", lt_plain: "Schlicht", lt_flag: "Flagge {{on}}" },
};
registerMessages(messages);

describe("text", () => {
  it("builds a key with optional params", () => {
    expect(text(testKey("lt_plain"))).toEqual({ key: "lt_plain" });
    expect(text(testKey("lt_hello"), { name: "Ada" })).toEqual({ key: testKey("lt_hello"), params: { name: "Ada" } });
  });

  it("is recognised by isLocalizedText, strings and null are not", () => {
    expect(isLocalizedText(text(testKey("lt_plain")))).toBe(true);
    for (const value of [testKey("lt_plain"), null, undefined, 1, {}, { key: 1 }]) expect(isLocalizedText(value)).toBe(false);
  });
});

describe("resolveText", () => {
  it("renders in the active language with params", () => {
    const { setLanguage } = useI18n();
    setLanguage("en");
    expect(resolveText(text(testKey("lt_hello"), { name: "Ada" }))).toBe("Hello Ada");
    setLanguage("de");
    expect(resolveText(text(testKey("lt_hello"), { name: "Ada" }))).toBe("Hallo Ada");
    setLanguage("en");
  });

  it("stringifies boolean params", () => {
    useI18n().setLanguage("en");
    expect(resolveText(text(testKey("lt_flag"), { on: true }))).toBe("Flag true");
  });

  it("passes a plain string through untouched, even one that looks like a key", () => {
    expect(resolveText(testKey("lt_plain"))).toBe(testKey("lt_plain"));
    expect(resolveText("Kick reason {{x}}")).toBe("Kick reason {{x}}");
  });

  it("returns null for null and undefined", () => {
    expect(resolveText(null)).toBeNull();
    expect(resolveText(undefined)).toBeNull();
  });

  it("falls back like t() for an unknown key", () => {
    expect(resolveText(text(testKey("lt_missing")))).toBe(testKey("lt_missing"));
  });
});

describe("re-rendering on a language switch", () => {
  it("updates a mounted component that holds a LocalizedText", async () => {
    const held = text(testKey("lt_hello"), { name: "Ada" });
    const Probe = defineComponent({ render: () => h("p", resolveText(held)) });
    const { setLanguage } = useI18n();
    setLanguage("en");
    const wrapper = mount(Probe);
    expect(wrapper.text()).toBe("Hello Ada");
    setLanguage("de");
    await nextTick();
    expect(wrapper.text()).toBe("Hallo Ada");
    setLanguage("en");
    wrapper.unmount();
  });
});

describe("LocalizedError", () => {
  it("carries its text and code, and renders the active language in the catch site", () => {
    const { setLanguage } = useI18n();
    setLanguage("en");
    const error = new LocalizedError(text(testKey("lt_hello"), { name: "Ada" }), "SOME_CODE");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("SOME_CODE");
    expect(error.message).toBe("Hello Ada");
    setLanguage("de");
    expect(resolveText(errorText(error, text(testKey("lt_plain"))))).toBe("Hallo Ada");
    setLanguage("en");
  });

  it("errorText passes other errors' messages through and falls back for non-errors", () => {
    expect(errorText(new Error("boom"), text(testKey("lt_plain")))).toBe("boom");
    expect(errorText(new Error(""), text(testKey("lt_plain")))).toEqual(text(testKey("lt_plain")));
    expect(errorText("nope", text(testKey("lt_plain")))).toEqual(text(testKey("lt_plain")));
  });
});
