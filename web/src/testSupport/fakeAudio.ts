// Test-only stubs for the Web Audio, WebCodecs and MediaStream APIs happy-dom lacks. They record enough to assert on and do no
// real audio. `browserStubs.ts` re-exports them and installs them on `globalThis`.

export class FakeAudioParam {
  value = 1;
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeAudioNode {
  readonly connections: unknown[] = [];
  disconnected = false;
  connect(target: unknown): unknown {
    this.connections.push(target);
    return target;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type = "lowpass";
  readonly frequency = new FakeAudioParam();
}

export class FakeConvolverNode extends FakeAudioNode {
  buffer: unknown = null;
  normalize = true;
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  getFloatTimeDomainData(target: Float32Array): void {
    target.fill(0);
  }
  getByteTimeDomainData(target: Uint8Array): void {
    target.fill(128);
  }
}

/** Records the frequencies a notification tone asks for, so a test can tell which tone played. */
export class FakeOscillatorNode extends FakeAudioNode {
  readonly frequencies: number[] = [];
  readonly frequency = {
    setValueAtTime: (value: number): void => {
      this.frequencies.push(value);
    },
  };
  started = false;
  start(): void {
    this.started = true;
  }
  stop(): void {}
}

export class FakeMediaStream {
  private readonly tracks: FakeMediaStreamTrack[];
  constructor(tracks: FakeMediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks(): FakeMediaStreamTrack[] {
    return [...this.tracks];
  }
  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  getVideoTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "video");
  }
  addTrack(track: FakeMediaStreamTrack): void {
    this.tracks.push(track);
  }
  removeTrack(track: FakeMediaStreamTrack): void {
    this.tracks.splice(this.tracks.indexOf(track), 1);
  }
}

export class FakeMediaStreamTrack {
  enabled = true;
  stopped = false;
  readyState: "live" | "ended" = "live";
  constructor(readonly kind: "audio" | "video" = "audio") {}
  stop(): void {
    this.stopped = true;
    this.readyState = "ended";
  }
  getSettings(): Record<string, unknown> {
    return {};
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null;
  started: number[] = [];
  stopped = false;
  private readonly endedListeners: (() => void)[] = [];
  addEventListener(type: string, listener: () => void): void {
    if (type === "ended") this.endedListeners.push(listener);
  }
  start(when = 0): void {
    this.started.push(when);
  }
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
  readonly oscillators: FakeOscillatorNode[] = [];
  onstatechange: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 48000;
    FakeAudioContext.instances.push(this);
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }
  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }
  createConvolver(): FakeConvolverNode {
    return new FakeConvolverNode();
  }
  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode();
  }
  createAnalyser(): FakeAnalyserNode {
    return new FakeAnalyserNode();
  }
  createMediaStreamSource(): FakeAudioNode {
    return new FakeAudioNode();
  }
  createMediaStreamDestination(): FakeAudioNode & { stream: FakeMediaStream } {
    return Object.assign(new FakeAudioNode(), { stream: new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
  }
  createScriptProcessor(): FakeAudioNode & { onaudioprocess: unknown } {
    return Object.assign(new FakeAudioNode(), { onaudioprocess: null as unknown });
  }
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): { copyToChannel: (data: Float32Array) => void; length: number; sampleRate: number; duration: number; numberOfChannels: number } {
    return { copyToChannel: () => {}, length, sampleRate, duration: length / sampleRate, numberOfChannels: channels };
  }
  createBufferSource(): FakeAudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  /** Test control: move to `state` and fire `statechange`, as a browser does after autoplay policy changes. */
  setState(state: AudioContextState): void {
    this.state = state;
    this.onstatechange?.();
    for (const listener of this.listeners.get("statechange") ?? []) listener();
  }
  async resume(): Promise<void> {
    this.state = "running";
  }
  async suspend(): Promise<void> {
    this.state = "suspended";
  }
  async close(): Promise<void> {
    this.state = "closed";
  }
}

export class FakeAudioWorkletNode extends FakeAudioNode {
  static instances: FakeAudioWorkletNode[] = [];
  readonly port: {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (message: unknown) => void;
    close: () => void;
    messages: unknown[];
  };
  constructor(
    readonly context: unknown,
    readonly name: string,
    readonly options?: unknown,
  ) {
    super();
    const messages: unknown[] = [];
    this.port = {
      onmessage: null,
      messages,
      postMessage: (message) => {
        messages.push(message);
      },
      close: () => {},
    };
    FakeAudioWorkletNode.instances.push(this);
  }
}

/** A decoded Opus frame as WebCodecs hands it to the decoder's `output` callback. */
export class FakeAudioData {
  closed = false;
  constructor(
    readonly numberOfFrames = 960,
    readonly sampleRate = 48000,
    readonly numberOfChannels = 1,
  ) {}
  copyTo(target: Float32Array): void {
    target.fill(0.25);
  }
  close(): void {
    this.closed = true;
  }
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
  configure(config: unknown): void {
    this.configured = config;
    this.state = "configured";
  }
  decode(chunk: unknown): void {
    this.chunks.push(chunk);
  }
  close(): void {
    this.state = "closed";
  }
}

export class FakeEncodedAudioChunk {
  constructor(readonly init: { type: string; timestamp: number; duration?: number; data: BufferSource }) {}
}
