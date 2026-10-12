import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LaunchOptions } from "@playwright/test";
import { launchOptions } from "./chromium";

export interface ToneOptions {
  frequencyHz?: number;
  /** 0 to 1. Zero makes a silent microphone. */
  amplitude?: number;
  /** Chromium loops the file, so this is the length of one period, not of the test. */
  seconds?: number;
  /** More Chromium flags next to the fake-microphone one. */
  extraArgs?: string[];
}

const RATE = 48_000;

/** A mono 48 kHz 16-bit PCM WAV of a sine wave, generated, never recorded. */
export function toneWav({ frequencyHz = 440, amplitude = 0.5, seconds = 5 }: ToneOptions = {}): Buffer {
  const samples = Math.round(RATE * seconds);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequencyHz * i) / RATE) * amplitude * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * `test.use(withAudioTone({ frequencyHz: 440 }))` at the top of a spec file makes the fake microphone of every browser in it
 * play this tone instead of Chromium's default beeps. Launch options can't be set in a describe block, so another tone needs
 * its own file.
 */
export function withAudioTone(options: ToneOptions = {}): { launchOptions: LaunchOptions } {
  const { frequencyHz = 440, amplitude = 0.5, seconds = 5, extraArgs = [] } = options;
  const dir = join(tmpdir(), "webspeak-e2e-tones");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `tone-${frequencyHz}hz-${amplitude}a-${seconds}s.wav`);
  writeFileSync(path, toneWav({ frequencyHz, amplitude, seconds }));
  return { launchOptions: launchOptions([`--use-file-for-fake-audio-capture=${path}`, ...extraArgs]) };
}
