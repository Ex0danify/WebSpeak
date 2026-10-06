import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** The one load of the CommonJS `@discordjs/opus`; the uplink encoder and the WebRTC session both build on it. */
export const OpusEncoder = (require("@discordjs/opus") as {
  OpusEncoder: new (sampleRate: number, channels: number) => {
    decode(data: Buffer): Buffer;
    encode(data: Buffer): Buffer;
  };
}).OpusEncoder;
