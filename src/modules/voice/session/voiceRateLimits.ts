import { TokenBucket, WindowCounter } from "../../../shared/tokenBucket.js";

/** Close code for a client that keeps flooding (policy violation). */
export const RATE_LIMIT_CLOSE_CODE = 1008;
export const AUDIO_RATE_LIMIT_CLOSE_REASON = "AUDIO_FRAME_RATE_LIMITED";

const AUDIO_BURST = 100;
const AUDIO_FRAMES_PER_SECOND = 50; // one 20 ms frame each
const AUDIO_DROPS_BEFORE_CLOSE = 200;
const AUDIO_DROP_WINDOW_MS = 1000;
const COMMAND_BURST = 60;
const COMMANDS_PER_SECOND = 20;
const COMMAND_REPLY_INTERVAL_MS = 1000;

export type AudioFrameVerdict = "accept" | "drop" | "close";

/**
 * Per-connection limits on what a browser may send. A valid ticket would otherwise be enough to drive Opus encoding,
 * TeamSpeak forwarding and command traffic as fast as the socket carries it, which gets the shared gateway
 * flood-banned by the TeamSpeak server for everyone.
 */
export class VoiceRateLimits {
  private readonly audio: TokenBucket;
  private readonly audioDrops = new WindowCounter(AUDIO_DROPS_BEFORE_CLOSE, AUDIO_DROP_WINDOW_MS);
  private readonly commands: TokenBucket;
  private commandReplyAt = Number.NEGATIVE_INFINITY;

  constructor(now = Date.now()) {
    this.audio = new TokenBucket(AUDIO_BURST, AUDIO_FRAMES_PER_SECOND, now);
    this.commands = new TokenBucket(COMMAND_BURST, COMMANDS_PER_SECOND, now);
  }

  /** A burst over the budget is dropped, a sustained flood closes the socket. */
  audioFrame(now = Date.now()): AudioFrameVerdict {
    if (this.audio.take(now)) return "accept";
    return this.audioDrops.hit(now) ? "close" : "drop";
  }

  /** Whether a text frame may run, and whether the refusal may be answered (at most once a second). */
  textFrame(now = Date.now()): { allowed: boolean; reply: boolean } {
    if (this.commands.take(now)) return { allowed: true, reply: false };
    const reply = now - this.commandReplyAt >= COMMAND_REPLY_INTERVAL_MS;
    if (reply) this.commandReplyAt = now;
    return { allowed: false, reply };
  }
}
