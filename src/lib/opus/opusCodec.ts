import { opusModule } from "./opusModule.js";

/** One Opus codec: encode an interleaved int16 PCM frame, decode a packet, reset state, free the WASM memory. */
export interface OpusCodec {
  encode(pcm: Buffer): Buffer;
  decode(packet: Buffer): Buffer;
  reset(): void;
  dispose(): void;
}

// 120 ms at 48 kHz is the largest Opus frame; a decoded stereo frame is the biggest PCM we hand back.
const MAX_FRAME_SAMPLES = 5760;
const MAX_PACKET_BYTES = 4000;

class WasmOpusCodec implements OpusCodec {
  private enc: number;
  private dec: number;
  // Scratch buffers reused across calls. Allocated once so the heap does not grow on the hot path.
  private readonly pcmPtr: number;
  private readonly pktPtr: number;
  private disposed = false;

  constructor(
    private readonly sampleRate: number,
    private readonly channels: number,
  ) {
    const m = opusModule();
    this.enc = m.ccall("enc_create", "number", ["number", "number"], [sampleRate, channels]);
    this.dec = m.ccall("dec_create", "number", ["number", "number"], [sampleRate, channels]);
    if (!this.enc || !this.dec) {
      this.dispose();
      throw new Error("Opus codec could not be created");
    }
    this.pcmPtr = m._malloc(MAX_FRAME_SAMPLES * channels * 2);
    this.pktPtr = m._malloc(MAX_PACKET_BYTES);
  }

  encode(pcm: Buffer): Buffer {
    const m = opusModule();
    const frameSize = pcm.length / 2 / this.channels;
    m.HEAPU8.set(pcm, this.pcmPtr);
    const len = m.ccall(
      "enc_encode",
      "number",
      ["number", "number", "number", "number", "number"],
      [this.enc, this.pcmPtr, frameSize, this.pktPtr, MAX_PACKET_BYTES],
    );
    if (len < 0) throw new Error(`Opus encode failed (${len})`);
    return Buffer.from(m.HEAPU8.subarray(this.pktPtr, this.pktPtr + len));
  }

  decode(packet: Buffer): Buffer {
    const m = opusModule();
    // Empty (end of transmission), oversized or garbage input yields no audio rather than throwing.
    if (packet.length === 0 || packet.length > MAX_PACKET_BYTES) return Buffer.alloc(0);
    m.HEAPU8.set(packet, this.pktPtr);
    const samples = m.ccall(
      "dec_decode",
      "number",
      ["number", "number", "number", "number", "number"],
      [this.dec, this.pktPtr, packet.length, this.pcmPtr, MAX_FRAME_SAMPLES],
    );
    if (samples <= 0) return Buffer.alloc(0);
    const bytes = samples * this.channels * 2;
    return Buffer.from(m.HEAPU8.subarray(this.pcmPtr, this.pcmPtr + bytes));
  }

  reset(): void {
    const m = opusModule();
    if (this.enc) m.ccall("enc_reset", "number", ["number"], [this.enc]);
    if (this.dec) m.ccall("dec_reset", "number", ["number"], [this.dec]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const m = opusModule();
    if (this.enc) m.ccall("enc_destroy", "number", ["number"], [this.enc]);
    if (this.dec) m.ccall("dec_destroy", "number", ["number"], [this.dec]);
    if (this.pcmPtr) m._free(this.pcmPtr);
    if (this.pktPtr) m._free(this.pktPtr);
    this.enc = 0;
    this.dec = 0;
  }
}

export function createOpusCodec(sampleRate: number, channels: number): OpusCodec {
  return new WasmOpusCodec(sampleRate, channels);
}
