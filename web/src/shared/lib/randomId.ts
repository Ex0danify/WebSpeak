/** Random hex for client side ids. Unlike `crypto.randomUUID`, `getRandomValues` also exists on plain HTTP origins. */
export function randomHex(bytes = 4): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
