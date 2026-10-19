// Avatars live in channel 0 under two different names. Downloads use the UID's bytes spelled as
// letters (`client_base64HashClientUID`), ftdeletefile wants the UID itself and answers the letter
// form with a convert error. Same on TS3 and TS6.

/** SHA-1 (TS3) or SHA-256 (TS6) in canonical base64. */
function uidBytes(uid: string): Buffer {
  const bytes = Buffer.from(uid, "base64");
  if ((bytes.length !== 20 && bytes.length !== 32) || bytes.toString("base64") !== uid) {
    throw new RangeError("Invalid TeamSpeak client UID");
  }
  return bytes;
}

/** Every nibble as a letter from `a` to `p`, what servers send as `client_base64HashClientUID`. */
export function avatarFileKey(uid: string): string {
  let key = "";
  for (const byte of uidBytes(uid)) key += String.fromCharCode(0x61 + (byte >> 4), 0x61 + (byte & 0x0f));
  return key;
}

export function avatarDownloadPath(uid: string): string {
  return `/avatar_${avatarFileKey(uid)}`;
}

/** Deleting needs `b_client_avatar_delete_other`, also for the own avatar, so guests cannot. */
export function avatarDeletePath(uid: string): string {
  uidBytes(uid);
  return `/avatar_${uid}`;
}
