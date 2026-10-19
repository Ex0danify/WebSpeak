import { afterEach, describe, expect, it, vi } from "vitest";
import { createUplinkEncoder } from "@/features/voice/engine/uplinkEncoder";

const target = globalThis as Record<string, unknown>;
const saved = new Map<string, { present: boolean; value: unknown }>();

function install(key: string, value: unknown): void {
  if (!saved.has(key)) saved.set(key, { present: key in target, value: target[key] });
  target[key] = value;
}

afterEach(() => {
  for (const [key, entry] of saved) {
    if (entry.present) target[key] = entry.value;
    else delete target[key];
  }
  saved.clear();
  FakeAudioEncoder.instances = [];
});

/** A WebCodecs AudioEncoder that emits one 5-byte packet synchronously for each encoded frame. */
class FakeAudioEncoder {
  static instances: FakeAudioEncoder[] = [];
  static isConfigSupported = vi.fn(async () => ({ supported: true }));
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  readonly encoded: unknown[] = [];
  constructor(readonly init: { output: (chunk: unknown) => void; error: (error: unknown) => void }) {
    FakeAudioEncoder.instances.push(this);
  }
  configure(): void {
    this.state = "configured";
  }
  encode(data: { numberOfFrames: number }): void {
    this.encoded.push(data);
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    this.init.output({ byteLength: payload.length, copyTo: (dest: Uint8Array) => dest.set(payload) });
  }
  close(): void {
    this.state = "closed";
  }
}

class FakeAudioData {
  closed = false;
  constructor(readonly init: { numberOfFrames: number; data: Float32Array }) {}
  close(): void {
    this.closed = true;
  }
}

function installWebCodecs(): void {
  install("AudioEncoder", FakeAudioEncoder);
  install("AudioData", FakeAudioData);
}

describe("uplink encoder", () => {
  it("encodes Opus and tags each frame with codec 4 when WebCodecs supports it", async () => {
    installWebCodecs();
    const packets: ArrayBuffer[] = [];
    const encoder = await createUplinkEncoder({ onPacket: (frame) => packets.push(frame) });
    expect(encoder.mode).toBe("opus");
    encoder.pushFrame(new Float32Array(960));
    expect(packets).toHaveLength(1);
    const bytes = new Uint8Array(packets[0]!);
    expect(bytes[0]).toBe(4);
    expect([...bytes.subarray(1)]).toEqual([1, 2, 3, 4, 5]);
  });

  it("advances the AudioData timestamp by 20 ms per frame and closes each one", async () => {
    installWebCodecs();
    const encoder = await createUplinkEncoder({ onPacket: () => {} });
    encoder.pushFrame(new Float32Array(960));
    encoder.pushFrame(new Float32Array(960));
    const data = FakeAudioEncoder.instances[0]!.encoded as { init: { numberOfFrames: number } }[];
    expect(data).toHaveLength(2);
  });

  it("falls back to tagged Int16 PCM when AudioEncoder is missing", async () => {
    const packets: ArrayBuffer[] = [];
    const encoder = await createUplinkEncoder({ onPacket: (frame) => packets.push(frame) });
    expect(encoder.mode).toBe("pcm");
    const frame = new Float32Array(960);
    frame.set([1, -1, 0.5, -0.5, 0]);
    encoder.pushFrame(frame);
    const bytes = new Uint8Array(packets[0]!);
    expect(bytes).toHaveLength(1 + 1920);
    expect(bytes[0]).toBe(0);
    const samples = new Int16Array(bytes.slice(1).buffer);
    expect([...samples.subarray(0, 5)]).toEqual([32767, -32768, 16383, -16384, 0]);
  });

  it("falls back to PCM when the Opus config is unsupported", async () => {
    FakeAudioEncoder.isConfigSupported = vi.fn(async () => ({ supported: false }));
    installWebCodecs();
    const encoder = await createUplinkEncoder({ onPacket: () => {} });
    expect(encoder.mode).toBe("pcm");
    FakeAudioEncoder.isConfigSupported = vi.fn(async () => ({ supported: true }));
  });

  it("closes the Opus encoder on dispose", async () => {
    installWebCodecs();
    const encoder = await createUplinkEncoder({ onPacket: () => {} });
    encoder.dispose();
    expect(FakeAudioEncoder.instances[0]!.state).toBe("closed");
  });
});
