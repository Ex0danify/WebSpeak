import { OpusEncoder } from "../voiceOpus.js";

/** The 48 kHz mono encoder that turns one browser PCM frame into the Opus packet sent to TeamSpeak. */
export function createUplinkOpusEncoder(): { encode(pcm: Buffer): Buffer } {
  return new OpusEncoder(48000, 1);
}
