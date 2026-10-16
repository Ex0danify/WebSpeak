import { describe, expect, it } from "vitest";
import type { MessageKey } from "@/shared/i18n/messageKeys";
import { useI18n } from "@/shared/i18n/useI18n";

// Compile-time (vue-tsc checks test files): MessageKey is a literal union fed by every module's `en`.
type IsLiteralUnion = string extends MessageKey ? false : true;
const literal: IsLiteralUnion = true;
const fromJoin: MessageKey = "browserWorkspace";
const fromCommon: MessageKey = "close";
// @ts-expect-error not a key of any module
const typo: MessageKey = "browserWorkspaec";

describe("MessageKey", () => {
  it("is the union of every module's default-language keys, and t() resolves them", () => {
    const { t } = useI18n();
    expect(literal).toBe(true);
    expect(t(fromJoin)).not.toBe(fromJoin);
    expect(t(fromCommon)).not.toBe(fromCommon);
    expect(t(typo)).toBe(typo);
  });
});
