/** Bounds for what the gateway (and through it other TeamSpeak users) can make the session store hold. */
export const MAX_CHAT_MESSAGES = 500;
export const MAX_SERVER_EVENTS = 500;
export const MAX_POKE_NOTIFICATIONS = 20;
export const MAX_CHAT_TEXT_LENGTH = 2000;
export const MAX_NICKNAME_LENGTH = 128;
export const MAX_AVATAR_LENGTH = 512 * 1024;

/** Appends items and drops the oldest entries beyond `max`. */
export function pushBounded<T>(list: T[], max: number, ...items: T[]): void {
  list.push(...items);
  if (list.length > max) list.splice(0, list.length - max);
}

export function clampText(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** An avatar is a data URL; one over the limit is treated as no avatar. */
export function readAvatar(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= MAX_AVATAR_LENGTH ? value : undefined;
}
