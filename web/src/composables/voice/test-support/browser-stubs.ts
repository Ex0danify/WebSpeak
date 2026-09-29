// Test-only stubs for the browser APIs happy-dom lacks and the voice composable touches.
// They record enough to assert on and do no real audio. Hot-path characterization (Step V0.5)
// builds on `FakeAudioContext` and `FakeAudioDecoder`.
import { FakeWebSocket } from "./fake-websocket";

export class FakeAudioParam {
  value = 1;
  setValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
  cancelScheduledValues(): this { return this; }
}

export class FakeAudioNode {
  readonly connections: unknown[] = [];
  disconnected = false;
  connect(target: unknown): unknown { this.connections.push(target); return target; }
  disconnect(): void { this.disconnected = true; }
}

export class FakeGainNode extends FakeAudioNode { readonly gain = new FakeAudioParam(); }

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  getFloatTimeDomainData(target: Float32Array): void { target.fill(0); }
  getByteTimeDomainData(target: Uint8Array): void { target.fill(128); }
}

export class FakeMediaStream {
  private readonly tracks: FakeMediaStreamTrack[];
  constructor(tracks: FakeMediaStreamTrack[] = []) { this.tracks = [...tracks]; }
  getTracks(): FakeMediaStreamTrack[] { return [...this.tracks]; }
  getAudioTracks(): FakeMediaStreamTrack[] { return this.tracks.filter((track) => track.kind === "audio"); }
  getVideoTracks(): FakeMediaStreamTrack[] { return this.tracks.filter((track) => track.kind === "video"); }
  addTrack(track: FakeMediaStreamTrack): void { this.tracks.push(track); }
  removeTrack(track: FakeMediaStreamTrack): void { this.tracks.splice(this.tracks.indexOf(track), 1); }
}

export class FakeMediaStreamTrack {
  enabled = true;
  stopped = false;
  readyState: "live" | "ended" = "live";
  constructor(readonly kind: "audio" | "video" = "audio") {}
  stop(): void { this.stopped = true; this.readyState = "ended"; }
  getSettings(): Record<string, unknown> { return {}; }
  addEventListener(): void {}
  removeEventListener(): void {}
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null;
  started: number[] = [];
  stopped = false;
  private readonly endedListeners: (() => void)[] = [];
  addEventListener(type: string, listener: () => void): void { if (type === "ended") this.endedListeners.push(listener); }
  start(when = 0): void { this.started.push(when); }
  stop(): void {
    this.stopped = true;
    for (const listener of this.endedListeners.splice(0)) listener();
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "running";
  currentTime = 0;
  readonly sampleRate: number;
  readonly destination = new FakeAudioNode();
  readonly audioWorklet = { addModule: async (_url: string): Promise<void> => {} };
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  onstatechange: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 48000;
    FakeAudioContext.instances.push(this);
  }

  createGain(): FakeGainNode { const node = new FakeGainNode(); this.gains.push(node); return node; }
  createAnalyser(): FakeAnalyserNode { return new FakeAnalyserNode(); }
  createMediaStreamSource(): FakeAudioNode { return new FakeAudioNode(); }
  createMediaStreamDestination(): FakeAudioNode & { stream: FakeMediaStream } {
    return Object.assign(new FakeAudioNode(), { stream: new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
  }
  createScriptProcessor(): FakeAudioNode & { onaudioprocess: unknown } { return Object.assign(new FakeAudioNode(), { onaudioprocess: null as unknown }); }
  createBuffer(channels: number, length: number, sampleRate: number): { copyToChannel: (data: Float32Array) => void; length: number; sampleRate: number; duration: number; numberOfChannels: number } {
    return { copyToChannel: () => {}, length, sampleRate, duration: length / sampleRate, numberOfChannels: channels };
  }
  createBufferSource(): FakeAudioBufferSourceNode { const node = new FakeAudioBufferSourceNode(); this.bufferSources.push(node); return node; }
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void { this.listeners.get(type)?.delete(listener); }
  /** Test control: move to `state` and fire `statechange`, as a browser does after autoplay policy changes. */
  setState(state: AudioContextState): void {
    this.state = state;
    this.onstatechange?.();
    for (const listener of this.listeners.get("statechange") ?? []) listener();
  }
  async resume(): Promise<void> { this.state = "running"; }
  async suspend(): Promise<void> { this.state = "suspended"; }
  async close(): Promise<void> { this.state = "closed"; }
}

export class FakeAudioWorkletNode extends FakeAudioNode {
  static instances: FakeAudioWorkletNode[] = [];
  readonly port: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (message: unknown) => void; close: () => void; messages: unknown[] };
  constructor(readonly context: unknown, readonly name: string, readonly options?: unknown) {
    super();
    const messages: unknown[] = [];
    this.port = { onmessage: null, messages, postMessage: (message) => { messages.push(message); }, close: () => {} };
    FakeAudioWorkletNode.instances.push(this);
  }
}

/** A decoded Opus frame as WebCodecs hands it to the decoder's `output` callback. */
export class FakeAudioData {
  closed = false;
  constructor(readonly numberOfFrames = 960, readonly sampleRate = 48000, readonly numberOfChannels = 1) {}
  copyTo(target: Float32Array): void { target.fill(0.25); }
  close(): void { this.closed = true; }
}

export class FakeAudioDecoder {
  static instances: FakeAudioDecoder[] = [];
  static isConfigSupported = async (): Promise<{ supported: boolean }> => ({ supported: true });
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  decodeQueueSize = 0;
  readonly chunks: unknown[] = [];
  configured: unknown = null;
  constructor(readonly init: { output: (data: unknown) => void; error: (error: unknown) => void }) {
    FakeAudioDecoder.instances.push(this);
  }
  configure(config: unknown): void { this.configured = config; this.state = "configured"; }
  decode(chunk: unknown): void { this.chunks.push(chunk); }
  close(): void { this.state = "closed"; }
}

export class FakeEncodedAudioChunk {
  constructor(readonly init: { type: string; timestamp: number; duration?: number; data: BufferSource }) {}
}

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
  constructor(readonly config?: unknown) { FakeRTCPeerConnection.instances.push(this); }
  addTrack(): { replaceTrack: () => Promise<void>; getParameters: () => Record<string, unknown>; setParameters: () => Promise<void> } {
    return { replaceTrack: async () => {}, getParameters: () => ({}), setParameters: async () => {} };
  }
  addTransceiver(): { sender: unknown; setCodecPreferences: () => void } { return { sender: this.addTrack(), setCodecPreferences: () => {} }; }
  getSenders(): unknown[] { return []; }
  getTransceivers(): unknown[] { return []; }
  async createAnswer(): Promise<{ type: string; sdp: string }> { return { type: "answer", sdp: "fake-answer" }; }
  async createOffer(): Promise<{ type: string; sdp: string }> { return { type: "offer", sdp: "fake-offer" }; }
  async setLocalDescription(description?: { type: string; sdp: string }): Promise<void> {
    this.localDescription = description ?? { type: "offer", sdp: "fake-offer" };
    this.iceGatheringState = "complete";
  }
  async setRemoteDescription(description: { type: string; sdp: string }): Promise<void> { this.remoteDescription = description; }
  async addIceCandidate(): Promise<void> {}
  async getStats(): Promise<Map<string, unknown>> { return new Map(); }
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void { this.closed = true; this.connectionState = "closed"; }
}

export interface BrowserStubOptions {
  /** What getUserMedia does. Default: reject like a browser with no microphone. */
  getUserMedia?: () => Promise<FakeMediaStream>;
  /** JSON answer for POST /api/join-ticket. Default: `{ ticket: "test-ticket" }` with status 200. */
  joinTicket?: { status?: number; body: Record<string, unknown> };
}

export interface BrowserStubs {
  fetchCalls: { url: string; init?: RequestInit }[];
  restore: () => void;
}

const GLOBAL_KEYS = [
  "WebSocket", "AudioContext", "AudioWorkletNode", "AudioDecoder", "EncodedAudioChunk",
  "RTCPeerConnection", "MediaStream", "fetch",
] as const;

/** Installs every stub on `globalThis` and returns a handle whose `restore()` undoes it. */
export function installBrowserStubs(options: BrowserStubOptions = {}): BrowserStubs {
  const target = globalThis as Record<string, unknown>;
  const saved = new Map<string, { present: boolean; value: unknown }>();
  const remember = (key: string): void => { saved.set(key, { present: key in target, value: target[key] }); };
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
    const answer = url.endsWith("/api/join-ticket") ? (options.joinTicket ?? { body: { ticket: "test-ticket" } }) : { status: 404, body: {} };
    const status = "status" in answer && answer.status ? answer.status : 200;
    return new Response(JSON.stringify(answer.body), { status, headers: { "content-type": "application/json" } });
  };

  const mediaDevices = {
    getUserMedia: options.getUserMedia ?? (async () => { throw Object.assign(new Error("Requested device not found"), { name: "NotFoundError" }); }),
    enumerateDevices: async () => [],
    getSupportedConstraints: () => ({}),
    getDisplayMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("video")]),
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
