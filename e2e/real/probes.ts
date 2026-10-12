import type { Page } from "@playwright/test";

// Browser-side probes for the audio specs of layer 5. The app keeps its audio graph and peer connection in closures a test
// cannot reach, so these wrap the browser APIs before the page starts and record on `window`. They change nothing about what
// the page does.

export interface ProbeOptions {
  /** Remove `RTCPeerConnection`, so the page cannot start WebRTC even when the gateway offers it. */
  withoutWebRtc?: boolean;
  /** Add one output device, "Probe speakers", to the device list and record every `setSinkId`. */
  speakers?: boolean;
}

export const PROBE_SPEAKER_ID = "probe-speaker-1";

/** The probes' record, as seen from the page. */
interface ProbeWindow {
  __notes: number[][];
  __gains: GainNode[];
  __goneGains: WeakSet<GainNode>;
  __peers: RTCPeerConnection[];
  __sinks: string[];
}

function probeScript(options: ProbeOptions & { speakerId: string }): void {
  const w = window as unknown as ProbeWindow & Record<string, unknown>;
  w.__notes = [];
  w.__gains = [];
  w.__goneGains = new WeakSet();
  w.__peers = [];
  w.__sinks = [];

  // A notification sound is the only oscillator the page makes: one entry per beep, with its two frequencies.
  const createOscillator = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (this: AudioContext): OscillatorNode {
    const oscillator = createOscillator.call(this);
    const frequencies: number[] = [];
    const setValueAtTime = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
    oscillator.frequency.setValueAtTime = (value: number, time: number) => {
      frequencies.push(value);
      return setValueAtTime(value, time);
    };
    const start = oscillator.start.bind(oscillator);
    oscillator.start = (when?: number) => {
      w.__notes.push([...frequencies]);
      start(when);
    };
    return oscillator;
  };

  const createGain = AudioContext.prototype.createGain;
  AudioContext.prototype.createGain = function (this: AudioContext): GainNode {
    const gain = createGain.call(this);
    w.__gains.push(gain);
    // A node the page tore down (a speaker's playback chain is rebuilt after a pause) no longer counts.
    const disconnect = gain.disconnect.bind(gain) as (...args: unknown[]) => void;
    gain.disconnect = ((...args: unknown[]) => {
      w.__goneGains.add(gain);
      return disconnect(...args);
    }) as GainNode["disconnect"];
    return gain;
  };

  const Native = window.RTCPeerConnection;
  if (options.withoutWebRtc) {
    delete (w as Record<string, unknown>).RTCPeerConnection;
  } else if (Native) {
    w.RTCPeerConnection = class extends Native {
      constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
        super(...args);
        w.__peers.push(this);
      }
    };
  }

  if (options.speakers) {
    const enumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () => [
      ...(await enumerateDevices()),
      {
        deviceId: options.speakerId,
        kind: "audiooutput",
        label: "Probe speakers",
        groupId: "probe",
        toJSON: () => ({}),
      } as MediaDeviceInfo,
    ];
    const record = async function (_this: unknown, id: string): Promise<void> {
      w.__sinks.push(id);
    };
    (HTMLMediaElement.prototype as unknown as Record<string, unknown>).setSinkId = function (id: string) {
      return record(this, id);
    };
    (AudioContext.prototype as unknown as Record<string, unknown>).setSinkId = function (id: string) {
      return record(this, id);
    };
  }
}

/** Call before the page's first navigation. */
export async function installProbes(page: Page, options: ProbeOptions = {}): Promise<void> {
  await page.addInitScript(probeScript, { ...options, speakerId: PROBE_SPEAKER_ID });
}

/** Every notification beep so far, as its two frequencies. */
export const notifications = (page: Page): Promise<number[][]> => page.evaluate(() => (window as unknown as ProbeWindow).__notes);

/**
 * How many gain nodes the page made and still uses are at zero right now. Compare two readings, the page has silent nodes
 * of its own (mic monitor).
 */
export const silentGains = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const probe = window as unknown as ProbeWindow;
    return probe.__gains.filter((gain) => !probe.__goneGains.has(gain) && gain.gain.value === 0).length;
  });

/** Every device id the page passed to `setSinkId`. */
export const sinkCalls = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as ProbeWindow).__sinks);

/** Inbound audio of the page's first peer connection, from the browser's own stats. */
export function inboundAudio(page: Page): Promise<{ packetsReceived: number; packetsLost: number; bytesReceived: number } | null> {
  return page.evaluate(async () => {
    const peer = (window as unknown as ProbeWindow).__peers[0];
    if (!peer) return null;
    for (const report of (await peer.getStats()).values()) {
      if (report.type === "inbound-rtp" && report.kind === "audio") {
        return {
          packetsReceived: report.packetsReceived ?? 0,
          packetsLost: report.packetsLost ?? 0,
          bytesReceived: report.bytesReceived ?? 0,
        };
      }
    }
    return null;
  });
}

/** The state and volume of the hidden `<audio>` element that plays WebRTC audio, or null before it exists. */
export const webRtcElement = (page: Page): Promise<{ volume: number; paused: boolean; muted: boolean } | null> =>
  page.evaluate(() => {
    const element = document.querySelector<HTMLAudioElement>("audio[aria-hidden='true']");
    return element ? { volume: element.volume, paused: element.paused, muted: element.muted } : null;
  });
