export const micCaptureWorkletUrl = "/mic-capture-worklet.js";

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
