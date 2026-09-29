export const micCaptureWorkletUrl = "/mic-capture-worklet.js";

export const VOX_HOLD = 15;
export const VOX_ATTACK_FRAMES = 1;
export const SPEAKING_HOLD_MS = 360;
export const AUDIO_FRAME_SAMPLES = 960;
export const AUDIO_FRAME_BYTES = AUDIO_FRAME_SAMPLES * 2;
export const MAX_AUDIO_BUFFERED_FRAMES = 10;
export const MAX_AUDIO_BUFFERED_BYTES = AUDIO_FRAME_BYTES * MAX_AUDIO_BUFFERED_FRAMES;
// Keep the WebSocket playback buffer below the 100 ms latency target. A
// 20 ms frame plus three queued decoder frames leaves only a short cushion
// for jitter; stale audio is discarded instead of being played late.
export const MAX_REMOTE_PLAY_AHEAD_SECONDS = 0.08;
export const MAX_REMOTE_DECODE_QUEUE_FRAMES = 3;
