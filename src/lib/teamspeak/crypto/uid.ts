import { createHash } from "node:crypto";

// A client's unique id is a hash of its omega text. Both hashes are confirmed against the
// invokeruid a TS3 3.13.7 and a TS6 beta13.1 server reported for the same identity.

/** What TeamSpeak 3 servers report: base64 SHA-1, 28 characters. */
export function ts3Uid(publicKeyBase64: string): string {
  return createHash("sha1").update(publicKeyBase64).digest("base64");
}

/** What TeamSpeak 6 servers report: base64 SHA-256, 44 characters. */
export function ts6Uid(publicKeyBase64: string): string {
  return createHash("sha256").update(publicKeyBase64).digest("base64");
}
