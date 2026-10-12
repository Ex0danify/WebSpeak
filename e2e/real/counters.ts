import type { AdminApi, Gateway } from "../../test/support/gateway";
import type { AudioFlowStats } from "../../src/modules/voice/index";
import { poll, type PollOptions } from "../helpers";

/**
 * The gateway's own audio counters of one session, read through the admin sessions API (the same
 * numbers the admin console shows). Nothing is sniffed and nothing is logged per frame.
 */
export class AudioCounters {
  private constructor(private readonly admin: AdminApi) {}

  static async of(gateway: Gateway): Promise<AudioCounters> {
    return new AudioCounters(await gateway.adminLogin());
  }

  async read(nickname: string): Promise<AudioFlowStats> {
    const { sessions } = (await (await this.admin.get("sessions")).json()) as { sessions: { nickname: string; audio: AudioFlowStats }[] };
    const session = sessions.find((candidate) => candidate.nickname === nickname);
    if (!session)
      throw new Error(`the gateway lists no session for "${nickname}": ${sessions.map((s) => s.nickname).join(", ") || "none"}`);
    return session.audio;
  }

  /** Waits until `pick` of the counters satisfies `accept`, and returns the counters. */
  async until(nickname: string, accept: (audio: AudioFlowStats) => boolean, options: PollOptions = {}): Promise<AudioFlowStats> {
    return poll(() => this.read(nickname), accept, { message: `the audio counters of "${nickname}"`, ...options });
  }
}

/**
 * Waits until a whole sampling window passes in which `read` does not change. The window is the
 * observation (nothing to wait for can show that something stopped), not a delay before it.
 */
export async function expectQuiet(read: () => number | Promise<number>, what: string, windowMs = 300): Promise<void> {
  await poll(
    async () => {
      const before = await read();
      await new Promise((resolve) => setTimeout(resolve, windowMs));
      return (await read()) - before;
    },
    (change) => change === 0,
    { timeoutMs: 8000, message: `${what} to go quiet` },
  );
}
