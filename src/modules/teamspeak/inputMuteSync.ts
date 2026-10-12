import type { CommandPacer } from "./commandPacer.js";

interface InputMuteTarget {
  execCommand(command: string): Promise<unknown>;
}

/**
 * Keeps TeamSpeak's input mute in step with the browser. TeamSpeak drops all audio from an input-muted
 * client, shared audio included, so the mute is only sent while no accompaniment plays. The browser takes
 * the mic out of the mix instead. Updates go out one after another and each sends the latest wanted state,
 * so a stale one never wins.
 */
export class InputMuteSync {
  private micMuted = false;
  private accompanimentActive = false;
  private sent: boolean | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly pacer: CommandPacer) {}

  /** A new connection starts unmuted. */
  reset(): void {
    this.sent = null;
  }

  setMicMuted(muted: boolean, target: InputMuteTarget, isCurrent: () => boolean): Promise<void> {
    this.micMuted = muted;
    return this.sync(target, isCurrent);
  }

  setAccompanimentActive(active: boolean, target: InputMuteTarget, isCurrent: () => boolean): Promise<void> {
    this.accompanimentActive = active;
    return this.sync(target, isCurrent);
  }

  private sync(target: InputMuteTarget, isCurrent: () => boolean): Promise<void> {
    const run = this.tail.then(async () => {
      if (!isCurrent()) return;
      const muted = this.micMuted && !this.accompanimentActive;
      if (muted === this.sent) return;
      await this.pacer.run(() => target.execCommand(`clientupdate client_input_muted=${muted ? 1 : 0}`));
      if (isCurrent()) this.sent = muted;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}
