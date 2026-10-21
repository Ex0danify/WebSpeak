interface OutputMuteTarget {
  execCommand(command: string): Promise<unknown>;
}

/**
 * Keeps TeamSpeak's output mute (the "deafened" flag other clients see) in step with the browser. The flag is only a label for
 * the other clients: the gateway never routes audio by it, so the browser still has to silence its own playback. Updates go out one after another and each sends the latest wanted state, so a stale one
 * never wins.
 */
export class OutputMuteSync {
  private wanted = false;
  private sent: boolean | null = null;
  private tail: Promise<void> = Promise.resolve();

  /** A new connection starts undeafened. */
  reset(): void {
    this.sent = null;
  }

  setOutputMuted(muted: boolean, target: OutputMuteTarget, isCurrent: () => boolean): Promise<void> {
    this.wanted = muted;
    const run = this.tail.then(async () => {
      if (!isCurrent()) return;
      const muted = this.wanted;
      if (muted === this.sent) return;
      await target.execCommand(`clientupdate client_output_muted=${muted ? 1 : 0}`);
      if (isCurrent()) this.sent = muted;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}
