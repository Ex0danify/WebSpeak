import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** One Opus codec instance: encode a PCM frame, decode a packet, plus lifecycle a native or WASM backend needs. */
export interface OpusCodec {
  encode(pcm: Buffer): Buffer;
  decode(packet: Buffer): Buffer;
  reset(): void;
  dispose(): void;
}

/** The one load of the CommonJS @discordjs/opus, shared by the uplink encoder and the WebRTC session. */
const NativeOpusEncoder = (
  require("@discordjs/opus") as {
    OpusEncoder: new (
      sampleRate: number,
      channels: number,
    ) => {
      decode(data: Buffer): Buffer;
      encode(data: Buffer): Buffer;
    };
  }
).OpusEncoder;

/**
 * The codec backend. @discordjs/opus keeps no handle to free and resets by discarding the instance,
 * so reset and dispose are no-ops here; the WebAssembly backend will implement both.
 */
export function createOpusCodec(sampleRate: number, channels: number): OpusCodec {
  const codec = new NativeOpusEncoder(sampleRate, channels);
  return {
    encode: (pcm) => codec.encode(pcm),
    decode: (packet) => codec.decode(packet),
    reset: () => {},
    dispose: () => {},
  };
}
