import { createOpusCodec, type OpusCodec } from "../voiceOpus.js";

/** The 48 kHz mono codec that turns one browser PCM frame into the Opus packet sent to TeamSpeak. */
export function createUplinkOpusEncoder(): OpusCodec {
  return createOpusCodec(48000, 1);
}
