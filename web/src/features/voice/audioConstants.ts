export const micCaptureWorkletUrl = "/mic-capture-worklet.js";

export const DEFAULT_VOX_THRESHOLD = 0.008;
export const VOX_THRESHOLD_MIN = 0.001;
export const VOX_THRESHOLD_MAX = 0.08;
/** micLevel is the capture RMS times this, so the VOX threshold (an RMS) reads on the same scale after dividing by it. */
export const MIC_LEVEL_GAIN = 6;
export const VOX_HOLD = 15;
export const VOX_ATTACK_FRAMES = 1;
export const SPEAKING_HOLD_MS = 360;
export const AUDIO_FRAME_SAMPLES = 960;
export const AUDIO_FRAME_BYTES = AUDIO_FRAME_SAMPLES * 2;
export const MAX_AUDIO_BUFFERED_FRAMES = 10;
export const MAX_AUDIO_BUFFERED_BYTES = AUDIO_FRAME_BYTES * MAX_AUDIO_BUFFERED_FRAMES;
// The WebSocket path has no network jitter buffer. Each talk burst starts this far ahead of the clock, so a late frame lands in
// the cushion instead of leaving a gap.
export const REMOTE_PLAYOUT_DELAY_SECONDS = 0.05;
// Cushion plus a 20 ms frame and three queued decoder frames. Anything further ahead is stale and gets discarded.
export const MAX_REMOTE_PLAY_AHEAD_SECONDS = REMOTE_PLAYOUT_DELAY_SECONDS + 0.08;
export const MAX_REMOTE_DECODE_QUEUE_FRAMES = 3;
