import type { MessageKey } from "@/shared/i18n/messageKeys";

/** A key a test registers itself (or deliberately leaves undefined) is not in the real catalog, so
 *  it is not a `MessageKey`; this is the one place the type is widened for that. */
export const testKey = (key: string): MessageKey => key as MessageKey;
