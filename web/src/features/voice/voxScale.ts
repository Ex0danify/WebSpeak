import { VOX_THRESHOLD_MAX, VOX_THRESHOLD_MIN } from "@/features/voice/audioConstants";

// The VOX threshold and the live level are RMS values, which are hard to set by eye on a linear scale: a quiet room and
// speech both end up in the top of the bar. Sliders show them in dB instead, one decibel per step.

const toDb = (rms: number) => 20 * Math.log10(rms);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const VOX_DB_MIN = Math.round(toDb(VOX_THRESHOLD_MIN));
export const VOX_DB_MAX = Math.floor(toDb(VOX_THRESHOLD_MAX));

export const voxToDb = (threshold: number): number => clamp(Math.round(toDb(threshold)), VOX_DB_MIN, VOX_DB_MAX);
export const dbToVox = (db: number): number => 10 ** (db / 20);
export const formatVoxDb = (db: number): string => `${db} dB`;

/** One step of a meter that rises at once and falls off over a few frames, so a live bar is readable instead of flickering. */
export const releaseLevel = (shown: number, share: number): number => (share > shown ? share : shown * 0.8 + share * 0.2);

/** Where an RMS level sits on the slider's dB range, 0 to 1. */
export function levelToShare(rms: number): number {
  // Not `rms <= 0`: this also catches NaN.
  if (!(rms > 0)) return 0;
  return clamp((toDb(rms) - VOX_DB_MIN) / (VOX_DB_MAX - VOX_DB_MIN), 0, 1);
}
