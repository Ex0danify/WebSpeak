// Every code the gateway can send in a screenShareError frame has a text.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveText } from "@/shared/i18n/localizedText";
import { useI18n } from "@/shared/i18n/useI18n";
import { translations } from "./i18n";
import { SCREEN_SHARE_ERROR_CODES, screenShareErrorMessage } from "./screenShareErrors";

const repoRoot = existsSync(resolve(process.cwd(), "src/shared/messageCodes.ts")) ? process.cwd() : resolve(process.cwd(), "..");
const catalog = readFileSync(resolve(repoRoot, "src/shared/messageCodes.ts"), "utf8");
const group = catalog.slice(catalog.indexOf("const SCREEN_SHARE_CODES"));
const gatewayCodes = [...group.slice(0, group.indexOf("\n};")).matchAll(/^ {2}([A-Z][A-Z0-9_]+): \{\} as /gm)].map((match) => match[1]);

describe("screen share error texts", () => {
  it("lists exactly the codes of the gateway catalog", () => {
    expect(gatewayCodes.length).toBe(19);
    expect([...SCREEN_SHARE_ERROR_CODES].sort()).toEqual([...gatewayCodes].sort());
  });

  it.each(gatewayCodes)("%s has a text in every language", (code) => {
    const { key } = screenShareErrorMessage(code);
    expect(translations.en[key as string], `en ${key}`).toBeTruthy();
    expect(translations.de[key as string], `de ${key}`).toBeTruthy();
  });

  it("uses the detail variant only when the gateway sent a detail", () => {
    expect(screenShareErrorMessage("SCREEN_SHARE_JOIN_FAILED")).toEqual({ key: "err_SCREEN_SHARE_JOIN_FAILED" });
    expect(screenShareErrorMessage("SCREEN_SHARE_JOIN_FAILED", { detail: "no\nway" })).toEqual({
      key: "screenShareJoinFailedDetail",
      params: { detail: "no way" },
    });
    expect(screenShareErrorMessage("SCREEN_SHARE_NOT_FOUND", { detail: "ignored" })).toEqual({ key: "err_SCREEN_SHARE_NOT_FOUND" });
  });

  it("falls back to the generic text for an unknown code and renders without placeholders", () => {
    expect(screenShareErrorMessage("SOMETHING_NEW")).toEqual({ key: "screenShareOperationFailed" });
    const { setLanguage } = useI18n();
    for (const language of ["en", "de"]) {
      setLanguage(language);
      for (const code of gatewayCodes)
        expect(resolveText(screenShareErrorMessage(code, { detail: "x" })), `${language} ${code}`).not.toMatch(/\{\{|^err_/);
    }
    setLanguage("en");
  });
});
