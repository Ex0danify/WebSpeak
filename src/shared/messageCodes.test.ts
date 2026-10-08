import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMessageCode, MESSAGE_CODES } from "./messageCodes.js";

// Every file that puts a user-visible code on the wire (I2.2 to I2.5 convert them one by one).
const SEND_SITES = [
  "../modules/voice/messages/voiceProtocol.ts",
  "../modules/voice/messages/voiceCommands.ts",
  "../modules/voice/messages/voiceMessageRouter.ts",
  "../modules/voice/session/voiceFailures.ts",
  "../modules/voice/audio/audioUplink.ts",
  "../modules/screenShare/screenShareProtocol.ts",
  "../modules/screenShare/screenSharePublish.ts",
  "../modules/screenShare/screenShareNative.ts",
];

// English-only `audioError` frame detail, not a catalog code (pinned in voiceBridge.seams.test.ts).
const OUT_OF_CATALOG = new Set(["AUDIO_ENCODER_UNAVAILABLE"]);

function codesIn(source: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bcode:\s*"([A-Z][A-Z_]+)"/g,
    /\binvalid\(\s*"([A-Z][A-Z_]+)"/g,
    /sendProtocolError\([^,]+,\s*"([A-Z][A-Z_]+)"/g,
    /classifyOperationError\([^,]+,\s*"([A-Z][A-Z_]+)"/g,
    /failureFrame\(\s*"([A-Z][A-Z_]+)"/g,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) found.add(match[1]);
  return [...found].filter((code) => !OUT_OF_CATALOG.has(code));
}

describe("message code catalog", () => {
  it("lists every code once, in upper snake case", () => {
    expect(new Set(MESSAGE_CODES).size).toBe(MESSAGE_CODES.length);
    for (const code of MESSAGE_CODES) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
  });

  it("covers every code the send sites use", () => {
    const missing = SEND_SITES.flatMap((path) => codesIn(readFileSync(new URL(path, import.meta.url), "utf8")).filter((code) => !isMessageCode(code)).map((code) => `${path}: ${code}`));
    expect(missing).toEqual([]);
  });

  it("has no catalog code that no send site uses", () => {
    const used = new Set(SEND_SITES.flatMap((path) => codesIn(readFileSync(new URL(path, import.meta.url), "utf8"))));
    expect(MESSAGE_CODES.filter((code) => !used.has(code))).toEqual([]);
  });
});
