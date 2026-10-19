// First byte of every uplink binary frame, so the gateway knows whether PCM or an encoded Opus frame follows.
const UPLINK_TAG_PCM = 0;
const UPLINK_TAG_OPUS_VOICE = 4;

const SAMPLE_RATE = 48_000;
const FRAME_DURATION_US = 20_000;
// Matches the gateway's WASM encoder settings: 48 kHz mono, 20 ms frames.
const OPUS_CONFIG: AudioEncoderConfig = {
  codec: "opus",
  sampleRate: SAMPLE_RATE,
  numberOfChannels: 1,
  bitrate: 64_000,
  opus: { frameDuration: FRAME_DURATION_US },
};

/** Turns 960-sample mono frames into tagged uplink frames: Opus when the browser can encode, otherwise Int16 PCM. */
export interface UplinkEncoder {
  readonly mode: "opus" | "pcm";
  /** One 20 ms mono frame (`AUDIO_FRAME_SAMPLES` Float32 samples). Consumed synchronously; the view may be reused after. */
  pushFrame(frame: Float32Array): void;
  dispose(): void;
}

export interface UplinkEncoderOptions {
  /** A finished tagged frame ready for the socket. Opus frames arrive asynchronously, PCM frames synchronously. */
  onPacket(frame: ArrayBuffer): void;
  /** Reported once when the Opus encoder fails after it was selected; the caller surfaces it. */
  onError?(error: unknown): void;
}

async function opusSupported(): Promise<boolean> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return false;
  try {
    const { supported } = await AudioEncoder.isConfigSupported(OPUS_CONFIG);
    return supported === true;
  } catch {
    return false;
  }
}

function createPcmEncoder(options: UplinkEncoderOptions): UplinkEncoder {
  return {
    mode: "pcm",
    pushFrame(frame) {
      const out = new Uint8Array(1 + frame.length * 2);
      out[0] = UPLINK_TAG_PCM;
      const view = new DataView(out.buffer, 1);
      for (let i = 0; i < frame.length; i++) {
        const sample = Math.max(-1, Math.min(1, frame[i]!));
        view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      }
      options.onPacket(out.buffer);
    },
    dispose() {},
  };
}

function createOpusEncoder(options: UplinkEncoderOptions): UplinkEncoder {
  let timestampUs = 0;
  let broken = false;
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const out = new Uint8Array(1 + chunk.byteLength);
      out[0] = UPLINK_TAG_OPUS_VOICE;
      chunk.copyTo(out.subarray(1));
      options.onPacket(out.buffer);
    },
    error: (error) => {
      broken = true;
      options.onError?.(error);
    },
  });
  encoder.configure(OPUS_CONFIG);
  return {
    mode: "opus",
    pushFrame(frame) {
      if (broken || encoder.state !== "configured") return;
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfFrames: frame.length,
        numberOfChannels: 1,
        timestamp: timestampUs,
        data: frame,
      });
      timestampUs += (frame.length / SAMPLE_RATE) * 1_000_000;
      try {
        encoder.encode(audioData);
      } finally {
        audioData.close();
      }
    },
    dispose() {
      if (encoder.state !== "closed") encoder.close();
    },
  };
}

/**
 * Picks the Opus path when WebCodecs can encode it, otherwise PCM. Always resolves; an encoder that cannot be built falls
 * back to PCM so the microphone never fails over the codec.
 */
export async function createUplinkEncoder(options: UplinkEncoderOptions): Promise<UplinkEncoder> {
  if (await opusSupported()) {
    try {
      return createOpusEncoder(options);
    } catch (error) {
      options.onError?.(error);
    }
  }
  return createPcmEncoder(options);
}
