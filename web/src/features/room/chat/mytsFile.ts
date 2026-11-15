export interface MytsFile {
  fileName: string;
  fileSize: number;
  /** The caption sent along, left out when it only repeats the file name. */
  description?: string;
}

const MARKER = '"msg_type":"ts.file.myts"';

/** A file shared through MyTeamSpeak arrives as a JSON text message. Anything else, or a payload of the wrong shape, is null. */
export function parseMytsFile(text: string): MytsFile | null {
  if (!text.startsWith("{") || !text.includes(MARKER)) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { msg_type: type, file_name: fileName, file_size: fileSize, body } = data as Record<string, unknown>;
  if (type !== "ts.file.myts" || typeof fileName !== "string" || !fileName) return null;
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize < 0) return null;
  const description = typeof body === "string" && body && body !== fileName ? body : undefined;
  return { fileName, fileSize, description };
}

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** `25831` becomes `25.2 KB`. */
export function formatFileSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value)} ${UNITS[unit]}`;
}
