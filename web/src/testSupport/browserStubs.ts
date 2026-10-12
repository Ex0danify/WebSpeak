// Test-only stubs for the browser APIs happy-dom lacks and the voice composable touches. They record enough to assert on and do
// no real audio. The hot-path test builds on `FakeAudioContext` and `FakeAudioDecoder`. The audio classes live in fakeAudio.ts and
// are re-exported here, so a test imports every stub from this one module.
import {
  FakeAudioContext,
  FakeAudioDecoder,
  FakeAudioWorkletNode,
  FakeEncodedAudioChunk,
  FakeMediaStream,
  FakeMediaStreamTrack,
} from "./fakeAudio";
import { FakeWebSocket } from "./fakeWebsocket";

export * from "./fakeAudio";

export class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];
  connectionState = "new";
  iceConnectionState = "new";
  iceGatheringState = "new";
  signalingState = "stable";
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  closed = false;
  constructor(readonly config?: unknown) {
    FakeRTCPeerConnection.instances.push(this);
  }
  addTrack(): { replaceTrack: () => Promise<void>; getParameters: () => Record<string, unknown>; setParameters: () => Promise<void> } {
    return { replaceTrack: async () => {}, getParameters: () => ({}), setParameters: async () => {} };
  }
  addTransceiver(): { sender: unknown; setCodecPreferences: () => void } {
    return { sender: this.addTrack(), setCodecPreferences: () => {} };
  }
  getSenders(): unknown[] {
    return [];
  }
  getTransceivers(): unknown[] {
    return [];
  }
  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: "answer", sdp: "fake-answer" };
  }
  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: "offer", sdp: "fake-offer" };
  }
  async setLocalDescription(description?: { type: string; sdp: string }): Promise<void> {
    this.localDescription = description ?? { type: "offer", sdp: "fake-offer" };
    this.iceGatheringState = "complete";
  }
  async setRemoteDescription(description: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = description;
  }
  async addIceCandidate(): Promise<void> {}
  async getStats(): Promise<Map<string, unknown>> {
    return new Map();
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }
}

export interface BrowserStubOptions {
  /** What getUserMedia does. Defaults to rejecting like a browser with no microphone. */
  getUserMedia?: () => Promise<FakeMediaStream>;
  /** JSON answer for POST /api/join-ticket. Defaults to `{ ticket: "test-ticket" }` with status 200. */
  joinTicket?: { status?: number; body: Record<string, unknown> };
}

export interface BrowserStubs {
  fetchCalls: { url: string; init?: RequestInit }[];
  restore: () => void;
}

const GLOBAL_KEYS = [
  "WebSocket",
  "AudioContext",
  "AudioWorkletNode",
  "AudioDecoder",
  "EncodedAudioChunk",
  "RTCPeerConnection",
  "MediaStream",
  "fetch",
] as const;

/** Installs every stub on `globalThis` and returns a handle whose `restore()` undoes it. */
export function installBrowserStubs(options: BrowserStubOptions = {}): BrowserStubs {
  const target = globalThis as Record<string, unknown>;
  const saved = new Map<string, { present: boolean; value: unknown }>();
  const remember = (key: string): void => {
    saved.set(key, { present: key in target, value: target[key] });
  };
  for (const key of GLOBAL_KEYS) remember(key);

  FakeWebSocket.reset();
  FakeAudioContext.instances = [];
  FakeAudioWorkletNode.instances = [];
  FakeAudioDecoder.instances = [];
  FakeRTCPeerConnection.instances = [];

  const fetchCalls: BrowserStubs["fetchCalls"] = [];
  target.WebSocket = FakeWebSocket;
  target.AudioContext = FakeAudioContext;
  target.AudioWorkletNode = FakeAudioWorkletNode;
  target.AudioDecoder = FakeAudioDecoder;
  target.EncodedAudioChunk = FakeEncodedAudioChunk;
  target.RTCPeerConnection = FakeRTCPeerConnection;
  target.MediaStream = FakeMediaStream;
  target.fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    fetchCalls.push({ url, init });
    const answer = url.endsWith("/api/join-ticket")
      ? (options.joinTicket ?? { body: { ticket: "test-ticket" } })
      : { status: 404, body: {} };
    const status = "status" in answer && answer.status ? answer.status : 200;
    return new Response(JSON.stringify(answer.body), { status, headers: { "content-type": "application/json" } });
  };

  const mediaDevices = {
    getUserMedia:
      options.getUserMedia ??
      (async () => {
        throw Object.assign(new Error("Requested device not found"), { name: "NotFoundError" });
      }),
    enumerateDevices: async () => [],
    getSupportedConstraints: () => ({}),
    getDisplayMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("video")]),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const navigatorRecord = navigator as unknown as Record<string, unknown>;
  const hadMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { value: mediaDevices, configurable: true });

  return {
    fetchCalls,
    restore() {
      for (const [key, entry] of saved) {
        if (entry.present) target[key] = entry.value;
        else delete target[key];
      }
      if (hadMediaDevices) Object.defineProperty(navigator, "mediaDevices", hadMediaDevices);
      else delete navigatorRecord.mediaDevices;
    },
  };
}
