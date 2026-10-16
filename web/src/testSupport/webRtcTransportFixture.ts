// Shared harness of the useWebRtcTransport / useWebRtcAccompaniment tests: stores, browser stubs and stub deps.
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, vi } from "vitest";
import { useVoiceAudioStore } from "@/features/voice/stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import {
  FakeAudioContext,
  FakeMediaStream,
  FakeMediaStreamTrack,
  FakeRTCPeerConnection,
  installBrowserStubs,
  type BrowserStubs,
} from "@/testSupport/browserStubs";
import type { SinkAudioContext } from "@/features/voice/voiceTypes";
import { useWebRtcTransport, type WebRtcTransportDeps } from "@/features/voice/engine/useWebRtcTransport";

/** Per-test state of the fake browser, reassigned by the hooks `useTransportFixture` registers. */
export const rtc = {} as {
  stubs: BrowserStubs;
  ctx: FakeAudioContext;
  micStream: FakeMediaStream | null;
  processedStream: FakeMediaStream | null;
  order: string[];
};

export function socketStub(readyState = 1) {
  return { readyState, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn>; readyState: number };
}

/** Record which stream every `createMediaStreamSource` call was given. */
export function recordSources(): unknown[] {
  const sources: unknown[] = [];
  const target = rtc.ctx as unknown as { createMediaStreamSource: (stream?: unknown) => unknown };
  const create = target.createMediaStreamSource.bind(rtc.ctx);
  target.createMediaStreamSource = (stream?: unknown) => {
    sources.push(stream);
    return create(stream);
  };
  return sources;
}

/** A display capture track: `ended` listeners are kept so a test can end the share as the browser does. */
export class FakeDisplayTrack extends FakeMediaStreamTrack {
  contentHint = "";
  applyConstraints = vi.fn(async (_constraints?: unknown) => undefined);
  private readonly endedListeners: (() => void)[] = [];
  override addEventListener(type?: string, listener?: () => void): void {
    if (type === "ended" && listener) this.endedListeners.push(listener);
  }
  end(): void {
    for (const listener of this.endedListeners.splice(0)) listener();
  }
}

/** Puts a display-audio share on the peer's audio sender, as the accompaniment button does. */
export async function shareAccompaniment(peer: FakeRTCPeerConnection, transport: ReturnType<typeof useWebRtcTransport>) {
  const audio = new FakeDisplayTrack("audio");
  const video = new FakeMediaStreamTrack("video");
  const replaceTrack = vi.fn(async (_track?: unknown) => undefined);
  vi.spyOn(peer, "getSenders").mockReturnValue([{ track: { kind: "audio" }, replaceTrack }] as unknown as RTCRtpSender[]);
  (navigator.mediaDevices as unknown as { getDisplayMedia: () => Promise<FakeMediaStream> }).getDisplayMedia = async () =>
    new FakeMediaStream([audio, video]);
  await transport.startAccompaniment();
  return { audio, video, replaceTrack };
}

/** happy-dom only takes its own MediaStream as `srcObject`; the fakes are not one. */
export function looseSrcObject(): void {
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { value: null, writable: true, configurable: true });
}

export function sentTypes(socket: WebSocket): string[] {
  return (socket.send as ReturnType<typeof vi.fn>).mock.calls.map(([frame]) => (JSON.parse(String(frame)) as { type: string }).type);
}

export function setup(overrides: Partial<WebRtcTransportDeps> = {}) {
  const audio = useVoiceAudioStore();
  const session = useSessionStore();
  const base = {
    getMicStream: vi.fn(() => rtc.micStream as unknown as MediaStream | null),
    getProcessedMicStream: vi.fn(() => (rtc.processedStream ?? rtc.micStream) as unknown as MediaStream | null),
    ensureMicrophone: vi.fn(async () => undefined),
    startMicrophone: vi.fn(async () => undefined),
    stopCaptureGraph: vi.fn(() => {
      rtc.order.push("captureGraph");
    }),
    setMicrophoneError: vi.fn(() => ({ key: "micFailedGeneric" as const })),
    getAudioCtx: vi.fn(() => rtc.ctx as unknown as SinkAudioContext),
    effectiveOutputVolume: vi.fn(() => 0.5),
    stopWebRtcPlayback: vi.fn(() => {
      rtc.order.push("playback");
    }),
    attachWebRtcPlayback: vi.fn(),
    syncWebRtcPlayback: vi.fn(async () => undefined),
    setAudioNotice: vi.fn(),
    clearAudioNotice: vi.fn(),
    markSpeaking: vi.fn(),
    clearSpeaking: vi.fn(),
    sendCmd: vi.fn(),
    sendCommand: vi.fn(async () => undefined),
    connectionSequence: vi.fn(() => 3),
    hasLastConnection: vi.fn(() => true),
    webrtcActive: ref(false),
    micLevel: ref(0),
  } satisfies WebRtcTransportDeps;
  const deps = { ...base, ...overrides } as typeof base;
  return { audio, session, deps, transport: useWebRtcTransport(deps) };
}

/** A transport with a negotiated offer in flight: the socket is the session socket too. */
export async function started(overrides: Partial<WebRtcTransportDeps> = {}) {
  const made = setup(overrides);
  const socket = socketStub();
  made.session.ws = socket;
  made.session.state.connected = true;
  await made.transport.startWebRtcTransport(3, socket);
  return { ...made, socket, peer: FakeRTCPeerConnection.instances.at(-1)! };
}

export function useTransportFixture(): void {
  beforeEach(() => {
    setActivePinia(createPinia());
    rtc.stubs = installBrowserStubs();
    rtc.ctx = new FakeAudioContext();
    rtc.micStream = new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
    rtc.processedStream = null;
    rtc.order = [];
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).srcObject;
    document.body.replaceChildren();
    rtc.stubs.restore();
    vi.restoreAllMocks();
  });
}
