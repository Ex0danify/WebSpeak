// Sound design of the cues, to keep new ones in the same family:
// - Voice: soft FM bell, low-passed and in a short dark room. No pitch sweeps, no high or metallic partials, no plain beeps.
// - Pitch: C4 to B4, from the C major pentatonic (C D E G A). Poke's B4 is the one exception.
// - Direction: rising opens or arrives, falling closes or leaves. userLeft is userJoined played backwards, returned is away.
// - Weight: cues about you run at full level, other people's events at about 0.6.
// - Length: notes ring longer than their spacing so they overlap. Roster cues stay under a second, state cues up to 1.5 s.
// - Identity: every cue needs a pitch sequence no other cue has. Error is the only single note, poke the only
//   repeated pitch, channelSwitched the only arch. Add a new cue to the distinctness test in useAudioOutput.test.ts.

/** One note of a cue. `at` is the offset from the start of the cue, both times are in seconds. */
interface Note {
  frequency: number;
  at: number;
  duration: number;
  /** Relative loudness, 1 is the cue's full level. */
  level?: number;
  /** Scales the bell's initial FM bite, above 1 sounds duller and more metallic. */
  bite?: number;
}

export type NotificationSound =
  | "connected"
  | "disconnected"
  | "reconnectFailed"
  | "error"
  | "poke"
  | "private"
  | "userJoined"
  | "userLeft"
  | "channelSwitched"
  | "away"
  | "returned";

// Pentatonic pitches in a low register keep every cue consonant and warm, whatever plays next to it.
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392;
const A4 = 440;
const B4 = 493.88;

export const NOTIFICATION_SOUNDS: Record<NotificationSound, readonly Note[]> = {
  // Rising triad, the room opens.
  connected: [
    { frequency: C4, at: 0, duration: 0.9, level: 0.8 },
    { frequency: E4, at: 0.12, duration: 0.9, level: 0.8 },
    { frequency: G4, at: 0.24, duration: 1.2 },
  ],
  // Falling triad, the room closes.
  disconnected: [
    { frequency: G4, at: 0, duration: 0.9, level: 0.8 },
    { frequency: E4, at: 0.13, duration: 0.9, level: 0.8 },
    { frequency: C4, at: 0.26, duration: 1.2, level: 0.9 },
  ],
  // Low and slow, clearly not good news.
  reconnectFailed: [
    { frequency: A4, at: 0, duration: 0.7, level: 0.9 },
    { frequency: E4, at: 0.27, duration: 0.8, level: 0.9 },
    { frequency: C4, at: 0.54, duration: 1.2, level: 0.9 },
  ],
  // One low, dull note. It is the only cue without a second pitch, so it never passes for a melody.
  error: [{ frequency: D4, at: 0, duration: 0.8, bite: 2.4 }],
  // Two identical pings, the only cue that repeats a pitch.
  poke: [
    { frequency: B4, at: 0, duration: 0.5 },
    { frequency: B4, at: 0.16, duration: 0.9 },
  ],
  // A single question-like lift.
  private: [
    { frequency: D4, at: 0, duration: 0.6, level: 0.8 },
    { frequency: A4, at: 0.13, duration: 1 },
  ],
  // Other people stay quieter than the cues about you.
  userJoined: [
    { frequency: D4, at: 0, duration: 0.6, level: 0.6 },
    { frequency: G4, at: 0.09, duration: 0.8, level: 0.6 },
  ],
  // The exact reverse of userJoined.
  userLeft: [
    { frequency: G4, at: 0, duration: 0.6, level: 0.6 },
    { frequency: D4, at: 0.09, duration: 0.8, level: 0.6 },
  ],
  // See you soon, settling down. Returned is the same fifth rising.
  away: [
    { frequency: G4, at: 0, duration: 0.7, level: 0.8 },
    { frequency: C4, at: 0.12, duration: 1.1, level: 0.9 },
  ],
  returned: [
    { frequency: C4, at: 0, duration: 0.6, level: 0.8 },
    { frequency: G4, at: 0.12, duration: 1, level: 1 },
  ],
  // A small arch, up and back to where it started.
  channelSwitched: [
    { frequency: E4, at: 0, duration: 0.45, level: 0.6 },
    { frequency: A4, at: 0.1, duration: 0.45, level: 0.6 },
    { frequency: G4, at: 0.2, duration: 0.9, level: 0.7 },
  ],
};

const ATTACK = 0.01;
const FLOOR = 0.0001;
// The tail falls to this share of the peak by the end of the note, then fades out.
const TAIL_SHARE = 0.018;
const RELEASE = 0.05;
// A soft electric-piano bell: the modulator runs at the carrier's pitch and its depth dies away fast, so the note starts with
// a little bite and settles into a plain, round tone.
const FM_DEPTH = 0.9;
const FM_DECAY = 0.6;
const LOWPASS_HZ = 2400;
// A short, dark room. The impulse is made once per context.
const REVERB_SECONDS = 0.9;
const REVERB_TAU = 0.22;
const REVERB_DAMPING_HZ = 1500;
const REVERB_SHARE = 0.12;

function onePole(samples: Float32Array, hz: number, sampleRate: number): void {
  const a = Math.exp((-2 * Math.PI * hz) / sampleRate);
  for (let pass = 0; pass < 2; pass++) {
    let acc = 0;
    for (let i = 0; i < samples.length; i++) {
      acc = (1 - a) * samples[i]! + a * acc;
      samples[i] = acc;
    }
  }
}

function createImpulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(REVERB_SECONDS * ctx.sampleRate);
  const fadeIn = Math.floor(0.012 * ctx.sampleRate);
  const channels = [new Float32Array(length), new Float32Array(length)];
  let energy = 0;
  for (const samples of channels) {
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / ctx.sampleRate / REVERB_TAU);
    onePole(samples, REVERB_DAMPING_HZ, ctx.sampleRate);
    for (let i = 0; i < fadeIn; i++) samples[i]! *= i / fadeIn;
    for (const value of samples) energy += value * value;
  }
  // Unit energy per channel, so the wet share means the same thing whatever the noise turned out to be.
  const scale = 1 / Math.sqrt(energy / channels.length);
  const buffer = ctx.createBuffer(channels.length, length, ctx.sampleRate);
  channels.forEach((samples, channel) => {
    for (let i = 0; i < length; i++) samples[i]! *= scale;
    buffer.copyToChannel(samples, channel);
  });
  return buffer;
}

const impulses = new WeakMap<AudioContext, AudioBuffer>();

function impulseFor(ctx: AudioContext): AudioBuffer {
  let impulse = impulses.get(ctx);
  if (!impulse) {
    impulse = createImpulse(ctx);
    impulses.set(ctx, impulse);
  }
  return impulse;
}

function playBell(ctx: AudioContext, output: AudioNode, note: Note, start: number, peak: number): void {
  const { frequency, duration } = note;
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const depth = ctx.createGain();
  const gain = ctx.createGain();
  carrier.frequency.setValueAtTime(frequency, start);
  modulator.frequency.setValueAtTime(frequency, start);
  depth.gain.setValueAtTime(FM_DEPTH * (note.bite ?? 1) * frequency, start);
  depth.gain.exponentialRampToValueAtTime(FLOOR * frequency, start + FM_DECAY);
  const top = Math.max(FLOOR, peak);
  gain.gain.setValueAtTime(FLOOR, start);
  gain.gain.linearRampToValueAtTime(top, start + ATTACK);
  gain.gain.exponentialRampToValueAtTime(top * TAIL_SHARE, start + duration - RELEASE);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  modulator.connect(depth);
  depth.connect(carrier.frequency);
  carrier.connect(gain);
  gain.connect(output);
  for (const oscillator of [carrier, modulator]) {
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }
}

/** Schedules a cue on `ctx`. `volume` is the final peak (0..1) of the loudest note. */
export function playNotificationSound(ctx: AudioContext, kind: NotificationSound, volume: number): void {
  const start = ctx.currentTime + 0.02;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = LOWPASS_HZ;
  const room = ctx.createConvolver();
  room.normalize = false;
  room.buffer = impulseFor(ctx);
  const wet = ctx.createGain();
  wet.gain.value = REVERB_SHARE;
  filter.connect(ctx.destination);
  filter.connect(room);
  room.connect(wet);
  wet.connect(ctx.destination);
  for (const note of NOTIFICATION_SOUNDS[kind]) {
    playBell(ctx, filter, note, start + note.at, volume * (note.level ?? 1));
  }
}
