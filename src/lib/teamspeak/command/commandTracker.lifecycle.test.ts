import { describe, expect, it } from "vitest";
import { ok, setupTracker } from "../../../../test/support/tsCommandHarness.js";
import { CommandTimeoutError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";

describe("CommandTracker timeouts, aborts and close", () => {
  it("times a command out without giving its late answer to the next one", async () => {
    const { tracker, receive, clock } = setupTracker();
    const slow = tracker.command("clientinfo clid=3", { timeoutMs: 1_000 });
    clock.advance(500);
    const next = tracker.command("version", { timeoutMs: 5_000 });
    clock.advance(500);
    const error = await slow.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommandTimeoutError);
    expect(error).toMatchObject({ command: "clientinfo", timeoutMs: 1_000 });
    expect(tracker.pending).toBe(1);

    receive("cid=1 client_nickname=late");
    receive(ok(1));
    receive("version=3.13.7");
    receive(ok(2));
    await expect(next).resolves.toEqual([{ version: "3.13.7" }]);
    expect(clock.pendingTimers).toBe(0);
  });

  it("uses the default timeout and one timer for all commands", async () => {
    const { tracker, clock } = setupTracker({ defaultTimeoutMs: 2_000 });
    const first = tracker.command("version");
    clock.advance(100);
    const second = tracker.command("version");
    expect(clock.pendingTimers).toBe(1);
    clock.advance(1_900);
    await expect(first).rejects.toBeInstanceOf(CommandTimeoutError);
    expect(clock.pendingTimers).toBe(1);
    clock.advance(100);
    await expect(second).rejects.toMatchObject({ timeoutMs: 2_000 });
    expect(clock.pendingTimers).toBe(0);
  });

  it("frees a timeout as soon as the answer is there", async () => {
    const { tracker, receive, clock } = setupTracker();
    const done = tracker.command("version");
    receive(ok(1));
    await done;
    expect(clock.pendingTimers).toBe(0);
  });

  it("rejects on abort, before and after sending, and keeps the order for the rest", async () => {
    const { tracker, receive, sent } = setupTracker();
    await expect(tracker.command("version", { signal: AbortSignal.abort(new Error("gone")) })).rejects.toThrow("gone");
    expect(sent).toEqual([]);

    const controller = new AbortController();
    const aborted = tracker.command("clientinfo clid=3", { signal: controller.signal });
    const next = tracker.command("version");
    controller.abort("no Error reason");
    await expect(aborted).rejects.toThrow("aborted");
    receive("cid=1");
    receive(ok(1));
    receive("version=1");
    receive(ok(2));
    await expect(next).resolves.toEqual([{ version: "1" }]);
  });

  it("lets an abort after the answer pass", async () => {
    const { tracker, receive } = setupTracker();
    const controller = new AbortController();
    const done = tracker.command("version", { signal: controller.signal });
    receive(ok(1));
    controller.abort();
    await expect(done).resolves.toEqual([]);
  });

  it("rejects everything waiting on close, with our own close as `closed`", async () => {
    const { tracker, clock, sent } = setupTracker();
    const first = tracker.command("version");
    const second = tracker.command("clientlist");
    tracker.close();
    await expect(first).rejects.toMatchObject({ code: "closed" });
    await expect(second).rejects.toBeInstanceOf(TeamSpeakTransportError);
    await expect(tracker.command("version")).rejects.toMatchObject({ code: "closed" });
    tracker.send("clientupdate client_away=1");
    expect(sent).toHaveLength(2);
    expect(tracker.pending).toBe(0);
    expect(clock.pendingTimers).toBe(0);
  });

  it("hands the transport error to every waiting command", async () => {
    const { tracker } = setupTracker();
    const pending = tracker.command("version");
    const error = new TeamSpeakTransportError("ackTimeout", "commands are not acknowledged");
    tracker.close(error);
    tracker.close();
    await expect(pending).rejects.toBe(error);
  });
});
