// Test-only setup for useScreenSharePeers: an RTCPeerConnection whose stats a test controls, the
// store, and an open socket that records what the module sends.
import { createPinia, setActivePinia } from "pinia";
import { useVoiceScreenShareStore } from "../../../stores/voiceScreenShare";
import { useVoiceSessionStore } from "../../../stores/voiceSession";
import type { ScreenShareOutputSettings, ScreenShareStream } from "../types";
import { useScreenSharePeers } from "../useScreenSharePeers";
import { FakeMediaStream, FakeMediaStreamTrack, FakeRTCPeerConnection, installBrowserStubs, type BrowserStubs } from "./browser-stubs";

export type Stat = Record<string, unknown>;

let queued: Stat[][] = [];

/** Peers created after `queueStats(records)` report those records from `getStats()`. */
export function queueStats(records: Stat[]): Stat[] {
  queued.push(records);
  return records;
}

export class StatsPeer extends FakeRTCPeerConnection {
  records: Stat[] = queued.shift() ?? [];
  override connectionState = "connected";
  override iceConnectionState = "connected";
  override async getStats(): Promise<Map<string, unknown>> {
    const records = this.records;
    return { forEach: (callback: (value: Stat) => void) => records.forEach(callback) } as unknown as Map<string, unknown>;
  }
}

export function installPeerEnvironment(): BrowserStubs {
  setActivePinia(createPinia());
  queued = [];
  const stubs = installBrowserStubs();
  (globalThis as Record<string, unknown>).RTCPeerConnection = StatsPeer;
  return stubs;
}

export function makeStream(overrides: Partial<ScreenShareStream> = {}): ScreenShareStream {
  return {
    streamId: "s1", source: "browser", ownerPeerId: "owner-1", ownerNickname: "Owner", name: "Screen", audio: false,
    createdAt: 1, viewerCount: 0, viewers: [], ...overrides,
  };
}

/** A display capture: one video track with the given settings, and an audio track. */
export function displayStream(video: Record<string, unknown> = {}) {
  const videoTrack = Object.assign(new FakeMediaStreamTrack("video"), { getSettings: () => video });
  const audioTrack = new FakeMediaStreamTrack("audio");
  const stream = new FakeMediaStream([videoTrack, audioTrack]);
  return { stream: stream as unknown as MediaStream, videoTrack, audioTrack };
}

/** The module on an open socket whose frames are parsed into `sent`. */
export function setupPeers() {
  const sent: Record<string, unknown>[] = [];
  const socket = { readyState: 1, send: (frame: string) => { sent.push(JSON.parse(frame) as Record<string, unknown>); } };
  useVoiceSessionStore().ws = socket as unknown as WebSocket;
  const module = useScreenSharePeers();
  const store = useVoiceScreenShareStore();
  const peers = FakeRTCPeerConnection.instances as StatsPeer[];
  /** Starts the own share on `stream` (the picker resolves at once) and forgets the frames it sent. */
  async function capture(stream: MediaStream, settings?: ScreenShareOutputSettings): Promise<void> {
    (navigator.mediaDevices as unknown as { getDisplayMedia: () => Promise<MediaStream> }).getDisplayMedia = async () => stream;
    await module.startScreenShare(true, settings);
    sent.length = 0;
  }
  return { module, sent, store, stats: store.screenShareWebRtcStats, peers, socket, capture };
}
