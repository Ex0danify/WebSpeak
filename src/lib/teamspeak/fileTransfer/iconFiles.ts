// Icons live in channel 0 as `/icon_<iconid>`. The id is the file's CRC32, so a changed icon is a new id.

/** Ids below this are the client's own bundled icons, there is no file on the server for them. */
const BUILTIN_ICON_LIMIT = 1000;

export function isBuiltinIconId(iconId: number): boolean {
  return iconId > 0 && iconId < BUILTIN_ICON_LIMIT;
}

export function iconDownloadPath(iconId: number): string {
  if (!Number.isInteger(iconId) || iconId < BUILTIN_ICON_LIMIT || iconId > 0xffffffff) {
    throw new RangeError(`Invalid TeamSpeak icon id: ${iconId}`);
  }
  return `/icon_${iconId}`;
}
