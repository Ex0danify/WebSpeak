import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import type { Pseudonyms } from "./pseudonyms.js";
import { redact } from "./redactor.js";

const LOG_NAME = "webspeak.log";
const ROTATED_LOGS = 3;
export const LOG_TAIL_BYTES = 3 * 1024 * 1024;

/** The newest part of the gateway log, a line at a time through the redactor. Empty without a log directory. */
export function readLogTail(logDir: string | undefined, pseudonyms: Pseudonyms, maxBytes = LOG_TAIL_BYTES): string {
  if (!logDir) return "";
  // Oldest first, the tail is cut from the end of the newest files.
  const files = [...Array.from({ length: ROTATED_LOGS }, (_, index) => `${LOG_NAME}.${ROTATED_LOGS - index}`), LOG_NAME]
    .map((name) => join(logDir, name))
    .filter((file) => existsSync(file));
  const chunks: string[] = [];
  let remaining = maxBytes;
  for (const file of files.reverse()) {
    if (remaining <= 0) break;
    const { text, complete } = readEnd(file, remaining);
    chunks.unshift(text);
    remaining -= Buffer.byteLength(text);
    if (!complete) break;
  }
  return chunks
    .join("")
    .split("\n")
    .filter(Boolean)
    .map((line) => redactLine(pseudonyms, line))
    .join("\n");
}

/** The last `bytes` of a file from the first complete line on. `complete` is false when the file was cut. */
function readEnd(file: string, bytes: number): { text: string; complete: boolean } {
  const descriptor = openSync(file, "r");
  try {
    const size = fstatSync(descriptor).size;
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    readSync(descriptor, buffer, 0, length, size - length);
    const text = buffer.toString("utf8");
    if (length === size) return { text: text.endsWith("\n") || !text ? text : `${text}\n`, complete: true };
    return { text: text.slice(text.indexOf("\n") + 1), complete: false };
  } finally {
    closeSync(descriptor);
  }
}

function redactLine(pseudonyms: Pseudonyms, line: string): string {
  try {
    return JSON.stringify(redact(pseudonyms, JSON.parse(line)));
  } catch {
    return pseudonyms.scrub(line);
  }
}
