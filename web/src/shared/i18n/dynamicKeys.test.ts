import { describe, expect, it } from "vitest";
import registry from "../../../scripts/i18n-dynamic-keys.json";
import { useI18n } from "./useI18n";
import { testKey } from "@/testSupport/testKey";

// Pins the keys behind the dynamic t(variable) call sites listed in scripts/i18n-dynamic-keys.json
// (check:i18n-keys keeps that list in step with the source). Every key such a site can produce
// must resolve to real text in every kept language, otherwise the screen would show the key name.
const { t, setLanguage } = useI18n();

describe("dynamic t() sites", () => {
  it.each(registry.sites.map((site) => [site.file, site.keys] as const))("%s: every key resolves", (_file, keys) => {
    for (const language of ["en", "de"] as const) {
      setLanguage(language);
      for (const key of keys) {
        expect(t(testKey(key)), `${language}/${key}`).not.toBe(key);
      }
    }
    setLanguage("en");
  });
});
