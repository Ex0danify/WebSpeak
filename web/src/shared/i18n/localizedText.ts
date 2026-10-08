import type { MessageKey } from "./messageKeys.js";
import { useI18n } from "./useI18n.js";

/** Values a `{{placeholder}}` can take. Wire `params` (booleans included) are accepted and stringified. */
export type TextParams = Record<string, string | number | boolean>;

/** A sentence that is not rendered yet: a message key plus its params. Stores and composables hold
 *  this instead of a finished string, so a language switch re-renders what is already on screen. */
export interface LocalizedText {
  key: MessageKey;
  params?: TextParams;
}

/** What a field may hold while it is migrated step by step: a `LocalizedText`, or an already
 *  rendered string (user data, or text not migrated yet), shown as is. */
export type MaybeLocalizedText = LocalizedText | string;

export function text(key: MessageKey, params?: TextParams): LocalizedText {
  return params ? { key, params } : { key };
}

/** An error that carries its sentence as a `LocalizedText` plus a stable `code`, so the catch site can
 *  render it in the active language at the edge. `message` is the sentence rendered when the error is
 *  made (logs, assertions); no UI reads it. */
export class LocalizedError extends Error {
  readonly text: LocalizedText;
  readonly code: string;

  constructor(text: LocalizedText, code = "") {
    super(resolveText(text));
    this.name = "LocalizedError";
    this.text = text;
    this.code = code;
  }
}

/** What a catch site shows for a thrown value: the error's own `LocalizedText`, else its message as
 *  is (text not migrated yet), else the fallback. */
export function errorText(error: unknown, fallback: LocalizedText): MaybeLocalizedText {
  if (error instanceof LocalizedError) return error.text;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  return typeof value === "object" && value !== null && typeof (value as LocalizedText).key === "string";
}

/** Render at the edge (a component template or a computed), in the active language. Reads the shared
 *  `language` ref through `t()`, so a template or computed calling this re-renders on a switch. */
export function resolveText(value: MaybeLocalizedText): string;
export function resolveText(value: MaybeLocalizedText | null | undefined): string | null;
export function resolveText(value: MaybeLocalizedText | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  const params: Record<string, string | number> = {};
  for (const [name, param] of Object.entries(value.params ?? {})) params[name] = typeof param === "boolean" ? String(param) : param;
  return useI18n().t(value.key, params);
}
