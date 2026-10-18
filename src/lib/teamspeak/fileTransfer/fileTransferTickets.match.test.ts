import { describe, expect, it } from "vitest";
import { ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { FileTransferError, TeamSpeakServerError } from "../errors/teamSpeakErrors.js";
import { buildCommand } from "../wire/commandText.js";
import { FileTransferTickets, ftInitDownload } from "./fileTransferTickets.js";

const START = { serverftfid: "9", ftkey: "RRtaDY63M54IdJgpig54Loht3waKd29Y", port: "30033", size: "3000", proto: "1" };
const start = (clientftfid: number, fields: Record<string, string> = {}) => ({ clientftfid: String(clientftfid), ...START, ...fields });
const status = (clientftfid: number) => ({ clientftfid: String(clientftfid), status: "2051", msg: "file not found", size: "0" });

function setup() {
  const clock = new ManualClock();
  return { clock, tickets: new FileTransferTickets(clock) };
}

describe("ftInitDownload", () => {
  it("builds the command in the native field order", () => {
    const request = ftInitDownload(3, { channelId: 0n, path: "/avatar_fimhonahhlkbkaikk" });
    expect(buildCommand(request.name, request.params)).toBe(
      "ftinitdownload clientftfid=3 name=\\/avatar_fimhonahhlkbkaikk cid=0 cpw= seekpos=0 proto=1",
    );
  });

  it("refuses relative paths and channel ids out of range", () => {
    expect(() => ftInitDownload(1, { channelId: 0n, path: "avatar" })).toThrow(RangeError);
    expect(() => ftInitDownload(1, { channelId: 0n, path: `/${"a".repeat(1024)}` })).toThrow(RangeError);
    expect(() => ftInitDownload(1, { channelId: -1n, path: "/a" })).toThrow(RangeError);
    expect(() => ftInitDownload(1, { channelId: 1n << 64n, path: "/a" })).toThrow(RangeError);
  });
});

describe("FileTransferTickets", () => {
  it("hands each download its own ticket, in whatever order they come", async () => {
    const { tickets } = setup();
    const first = tickets.open();
    const second = tickets.open();
    expect([first.clientTransferId, second.clientTransferId]).toEqual([1, 2]);
    expect(tickets.receive("notifystartdownload", start(2, { port: "30034" }))).toBe(true);
    expect(tickets.receive("notifystatusfiletransfer", status(1))).toBe(true);
    await expect(second.ticket(1000)).resolves.toEqual({ serverTransferId: 9, key: START.ftkey, port: 30034, size: 3000n });
    const error = await first.ticket(1000).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TeamSpeakServerError);
    expect(error).toMatchObject({ id: 2051, serverMessage: "file not found" });
  });

  it("takes a ticket that arrives while waiting", async () => {
    const { tickets } = setup();
    const download = tickets.open();
    const waiting = download.ticket(1000);
    tickets.receive("notifystartdownload", start(download.clientTransferId));
    await expect(waiting).resolves.toMatchObject({ port: 30033 });
  });

  it("leaves other notifications and unknown or settled ids alone", () => {
    const { tickets } = setup();
    const download = tickets.open();
    expect(tickets.receive("notifytextmessage", start(1))).toBe(false);
    expect(tickets.receive("notifystartdownload", start(7))).toBe(false);
    expect(tickets.receive("notifystartdownload", undefined)).toBe(false);
    expect(tickets.receive("notifystartdownload", start(1))).toBe(true);
    // The server's "transfer complete" status after the download.
    expect(tickets.receive("notifystatusfiletransfer", status(1))).toBe(false);
    download.release();
    download.release();
    expect(tickets.receive("notifystartdownload", start(1))).toBe(false);
  });

  it("rejects a ticket it cannot use", async () => {
    const { tickets } = setup();
    const broken: Record<string, string>[] = [{ port: "0" }, { ftkey: "" }, { ftkey: "has space" }, { size: "-1" }, { serverftfid: "x" }];
    for (const fields of broken) {
      const download = tickets.open();
      tickets.receive("notifystartdownload", start(download.clientTransferId, fields));
      const error = await download.ticket(1000).catch((reason: unknown) => reason);
      expect(error).toMatchObject({ code: "malformedTicket" });
    }
    const missing = tickets.open();
    tickets.receive("notifystatusfiletransfer", { clientftfid: String(missing.clientTransferId) });
    await expect(missing.ticket(1000)).rejects.toMatchObject({ id: 0, serverMessage: "" });
  });

  it("times out on the injected clock", async () => {
    const { clock, tickets } = setup();
    const waiting = tickets.open().ticket(500);
    clock.advance(499);
    clock.advance(1);
    const error = await waiting.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(FileTransferError);
    expect(error).toMatchObject({ code: "timeout" });
    expect(clock.pendingTimers).toBe(0);
  });

  it("stops on abort, also an earlier one", async () => {
    const { clock, tickets } = setup();
    const reason = new Error("stop");
    await expect(tickets.open().ticket(500, AbortSignal.abort(reason))).rejects.toBe(reason);
    const controller = new AbortController();
    const waiting = tickets.open().ticket(500, controller.signal);
    controller.abort("plain");
    await expect(waiting).rejects.toThrow("aborted");
    expect(clock.pendingTimers).toBe(0);
  });

  it("fails waiting and later downloads once closed", async () => {
    const { tickets } = setup();
    const download = tickets.open();
    const waiting = download.ticket(1000);
    const closed = new Error("closed");
    tickets.close(closed);
    tickets.close(new Error("again"));
    await expect(waiting).rejects.toBe(closed);
    expect(() => tickets.open()).toThrow(closed);
  });

  it("wraps the id and skips ids still in use", () => {
    const { tickets } = setup();
    const kept = tickets.open();
    for (let i = 2; i <= 0xffff; i++) tickets.open().release();
    expect(tickets.open().clientTransferId).toBe(2);
    expect(kept.clientTransferId).toBe(1);
  });
});
