import type { ConfiguredAccelerationRelay } from "../../../modules/relay/index.js";

export function resolveAccelerationOptions(
  configured: ConfiguredAccelerationRelay[] | (() => ConfiguredAccelerationRelay[]) | undefined,
): ConfiguredAccelerationRelay[] {
  const value = typeof configured === "function" ? configured() : configured;
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
