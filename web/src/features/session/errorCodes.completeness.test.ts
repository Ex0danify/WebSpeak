// Step I3.1: every code the gateway can put in front of a user has a text in every language.
// The gateway lists are read as text (the web project does not import the gateway), the web lists are imported.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { translations } from "./i18n";
import {
  GATEWAY_CLOSE_CODE_CODES,
  JOIN_TICKET_CODES,
  OPERATION_ERROR_CODES,
  closeErrorCode,
  connectionFailureMessage,
  joinTicketReason,
  protocolErrorMessage,
} from "./connectionMessages";
import { CONNECTION_FAILURE_CODES, errorKey } from "./sessionErrors";
import { resolveText } from "@/shared/i18n/localizedText";
import { useI18n } from "@/shared/i18n/useI18n";

// Vitest runs from the repository root (docs/testing/README.md); `npm --prefix web` runs one level down.
const repoRoot = existsSync(resolve(process.cwd(), "src/shared/errors.ts")) ? process.cwd() : resolve(process.cwd(), "..");
const repoFile = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const quoted = (source: string) => [...source.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map((match) => match[1]);
const arrayLiteral = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const end = source.indexOf("] as const", start);
  expect(start, `${name} in src/shared/errors.ts`).toBeGreaterThan(-1);
  return quoted(source.slice(start, end));
};

const errors = repoFile("src/shared/errors.ts");
const catalog = repoFile("src/shared/messageCodes.ts");
const screenShareStart = catalog.indexOf("const SCREEN_SHARE_CODES");
// The screen share group has its own browser-side list and texts (features/screenShare, Step I3.4).
const gatewayCatalogCodes = [...catalog.slice(0, screenShareStart).matchAll(/^ {2}([A-Z][A-Z0-9_]+): \{\} as /gm)].map((match) => match[1]);
const joinRouteCodes = [...repoFile("src/transport/http/routes/registerJoinRoutes.ts").matchAll(/code: "([A-Z_]+)"/g)].map((match) => match[1]);

function expectKey(key: string) {
  expect(translations.en[key], `en ${key}`).toBeTruthy();
  expect(translations.de[key], `de ${key}`).toBeTruthy();
}

describe("error code completeness", () => {
  it("reads the gateway lists it is meant to check", () => {
    expect(arrayLiteral(errors, "CLIENT_CONNECTION_FAILURE_CODES").length).toBeGreaterThan(20);
    expect(arrayLiteral(errors, "BRIDGE_CONNECTION_FAILURE_CODES")).toEqual(["IDENTITY_INVALID", "TEAM_SPEAK_CLIENT_UNAVAILABLE"]);
    expect(gatewayCatalogCodes.length).toBeGreaterThan(30);
    expect(joinRouteCodes).toContain("TARGET_NOT_ALLOWED");
  });

  it.each([
    ["connection failure codes", () => arrayLiteral(errors, "CLIENT_CONNECTION_FAILURE_CODES")],
    ["bridge connection failure codes", () => arrayLiteral(errors, "BRIDGE_CONNECTION_FAILURE_CODES")],
    ["gateway close codes", () => Object.values(GATEWAY_CLOSE_CODE_CODES)],
  ])("explains every one of the %s", (_name, codes) => {
    for (const code of codes()) {
      expect(CONNECTION_FAILURE_CODES.has(code), code).toBe(true);
      expectKey(errorKey(code) as string);
    }
  });

  it("explains every protocol and operation code of the gateway catalog", () => {
    for (const code of gatewayCatalogCodes) {
      expect(OPERATION_ERROR_CODES.has(code), code).toBe(true);
      const { key } = protocolErrorMessage(code, "");
      expect(key, code).not.toMatch(/Unknown/);
      expectKey(key as string);
    }
  });

  it("explains every join-ticket refusal", () => {
    for (const code of joinRouteCodes) {
      const { key } = joinTicketReason(code);
      expect(key, code).not.toBe("connectionFailedUnknown");
      expectKey(key as string);
    }
    for (const code of JOIN_TICKET_CODES) expectKey(errorKey(code, "joinErr") as string);
  });

  it("has a key behind every code the web side lists", () => {
    for (const code of CONNECTION_FAILURE_CODES) expectKey(errorKey(code) as string);
    for (const code of OPERATION_ERROR_CODES) expectKey(protocolErrorMessage(code, "").key as string);
  });

  it("maps every close code to a code with a text", () => {
    for (const closeCode of Object.keys(GATEWAY_CLOSE_CODE_CODES).map(Number)) {
      expectKey(connectionFailureMessage(closeErrorCode(closeCode)).key as string);
    }
  });

  it("renders in both languages without a placeholder left over", () => {
    const { setLanguage } = useI18n();
    for (const language of ["en", "de"]) {
      setLanguage(language);
      for (const code of CONNECTION_FAILURE_CODES) {
        const rendered = resolveText(connectionFailureMessage(code));
        expect(rendered, `${language} ${code}`).not.toMatch(/\{\{|^err_/);
      }
      expect(resolveText(connectionFailureMessage("WEIRD", "detail"))).toContain("WEIRD");
      expect(resolveText(connectionFailureMessage("WEIRD", "detail"))).toContain("detail");
    }
    setLanguage("en");
  });
});
