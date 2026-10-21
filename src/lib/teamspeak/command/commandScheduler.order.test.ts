import { describe, expect, it } from "vitest";
import { ok, setupTracker } from "../../../../test/support/tsCommandHarness.js";
import { TeamSpeakServerError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { CommandScheduler, type CommandSchedulerOptions } from "./commandScheduler.js";

const FLOOD = "error id=524 msg=client\\sis\\sflooding";

function setup(options: CommandSchedulerOptions = {}) {
  const harness = setupTracker();
  const scheduler = new CommandScheduler(harness.tracker, { clock: harness.clock, ...options });
  const names = () => harness.sent.map((text) => text.replace(/ return_code=\d+$/, ""));
  return { ...harness, scheduler, names };
}

/** Lets the promise chains between tracker and scheduler run. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("CommandScheduler", () => {
  it("sends a burst of 5 at once and then 4 per second", () => {
    const { scheduler, sent, clock } = setup();
    for (let i = 0; i < 8; i++) scheduler.command(`version`).catch(() => undefined);
    expect(sent).toHaveLength(5);
    expect(scheduler.queued).toBe(3);
    clock.advance(250);
    expect(sent).toHaveLength(6);
    clock.advance(500);
    expect(sent).toHaveLength(8);
    expect(clock.pendingTimers).toBe(1);
  });

  it("puts interactive commands before background ones and sends `send` without a return code", () => {
    const { scheduler, sent, clock } = setup({ budget: { initial: 0 } });
    scheduler.command("clientupdate client_input_muted=1", { priority: "background" }).catch(() => undefined);
    scheduler.send("setupstream name=screen", { priority: "background" });
    scheduler.command("clientpoke clid=3 msg=hi").catch(() => undefined);
    clock.advance(250);
    expect(sent).toEqual(["clientpoke clid=3 msg=hi return_code=1"]);
    clock.advance(250);
    expect(sent.at(-1)).toBe("clientupdate client_input_muted=1 return_code=2");
  });

  it("runs background commands one at a time in order", async () => {
    const { scheduler, names, receive } = setup();
    const first = scheduler.command("clientupdate client_input_muted=1", { priority: "background" });
    const second = scheduler.command("clientupdate client_input_muted=0", { priority: "background" });
    const interactive = scheduler.command("version");
    expect(names()).toEqual(["clientupdate client_input_muted=1", "version"]);
    receive(ok(1));
    await flush();
    expect(names()).toEqual(["clientupdate client_input_muted=1", "version", "clientupdate client_input_muted=0"]);
    receive(ok(2));
    receive(ok(3));
    await expect(Promise.all([first, interactive, second])).resolves.toEqual([[], [], []]);
  });

  it("retries a flooded background command with backoff before the next one goes out", async () => {
    const { scheduler, names, receive, clock } = setup();
    const mute = scheduler.command("clientupdate client_input_muted=1", { priority: "background" });
    const unmute = scheduler.command("clientupdate client_input_muted=0", { priority: "background" });
    receive(`${FLOOD} return_code=1`);
    await flush();
    clock.advance(1_499);
    expect(names()).toEqual(["clientupdate client_input_muted=1"]);
    clock.advance(1);
    expect(names()).toEqual(["clientupdate client_input_muted=1", "clientupdate client_input_muted=1"]);
    receive(`${FLOOD} return_code=2`);
    await flush();
    clock.advance(3_000);
    expect(names()).toHaveLength(3);
    receive(ok(3));
    await expect(mute).resolves.toEqual([]);
    await flush();
    expect(names().at(-1)).toBe("clientupdate client_input_muted=0");
    receive(ok(4));
    await expect(unmute).resolves.toEqual([]);
  });

  it("gives up after the retries and never retries interactive commands", async () => {
    const { scheduler, receive, clock, sent } = setup({ floodRetries: 1, floodRetryDelayMs: 100 });
    const background = scheduler.command("version", { priority: "background" });
    receive(`${FLOOD} return_code=1`);
    await flush();
    clock.advance(1_000);
    receive(`${FLOOD} return_code=2`);
    await expect(background).rejects.toMatchObject({ id: 524 });

    const interactive = scheduler.command("clientpoke clid=3 msg=x");
    clock.advance(250);
    expect(sent).toHaveLength(3);
    receive(`${FLOOD} return_code=3`);
    const error = await interactive.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TeamSpeakServerError);
    // The refusal emptied the budget, the next command waits for a token.
    scheduler.command("version").catch(() => undefined);
    expect(sent).toHaveLength(3);
    clock.advance(250);
    expect(sent).toHaveLength(4);
  });

  it("passes other server errors through at once", async () => {
    const { scheduler, receive } = setup();
    const move = scheduler.command("clientmove clid=3 cid=9", { priority: "background" });
    receive("error id=781 msg=invalid\\schannel\\spassword return_code=1");
    await expect(move).rejects.toMatchObject({ id: 781 });
  });

  it("takes aborted commands out of the queue and out of a retry wait", async () => {
    const { scheduler, receive, clock, names } = setup({ budget: { initial: 1 } });
    await expect(scheduler.command("version", { signal: AbortSignal.abort() })).rejects.toThrow("aborted");
    const retried = new AbortController();
    const flooded = scheduler.command("clientupdate client_away=1", { priority: "background", signal: retried.signal });
    const queued = new AbortController();
    const waiting = scheduler.command("version", { signal: queued.signal });
    queued.abort(new Error("left"));
    await expect(waiting).rejects.toThrow("left");

    receive(`${FLOOD} return_code=1`);
    await flush();
    retried.abort();
    await expect(flooded).rejects.toThrow("aborted");
    clock.advance(10_000);
    expect(names()).toEqual(["clientupdate client_away=1"]);
    expect(scheduler.queued).toBe(0);
  });

  it("rejects queued and sent commands with the same error on close", async () => {
    const { scheduler, sent, clock } = setup({ budget: { initial: 1 } });
    const sentOne = scheduler.command("version");
    const queuedOne = scheduler.command("clientlist", { priority: "background" });
    scheduler.send("setupstream", { priority: "background" });
    const error = new TeamSpeakTransportError("timeout", "no packet from the peer in time");
    scheduler.close(error);
    scheduler.close();
    await expect(sentOne).rejects.toBe(error);
    await expect(queuedOne).rejects.toBe(error);
    await expect(scheduler.command("version")).rejects.toBe(error);
    scheduler.send("version");
    clock.advance(10_000);
    expect(sent).toHaveLength(1);
    expect(clock.pendingTimers).toBe(0);
  });

  it("closes as `closed` when the owner closes", async () => {
    const { scheduler } = setup();
    const pending = scheduler.command("version");
    scheduler.close();
    await expect(pending).rejects.toMatchObject({ code: "closed" });
  });

  it("does not retry a flood refusal that arrives after the close", async () => {
    const { scheduler, receive } = setup();
    const pending = scheduler.command("version", { priority: "background" });
    receive(`${FLOOD} return_code=1`);
    scheduler.close();
    await expect(pending).rejects.toMatchObject({ id: 524 });
    expect(scheduler.queued).toBe(0);
  });
});
