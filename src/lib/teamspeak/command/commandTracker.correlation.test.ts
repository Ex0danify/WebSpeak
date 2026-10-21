import { describe, expect, it, vi } from "vitest";
import { ok, setupTracker } from "../../../../test/support/tsCommandHarness.js";
import { TeamSpeakServerError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";

describe("CommandTracker correlation", () => {
  it("tags every command with its own return code", () => {
    const { tracker, sent } = setupTracker();
    void tracker.command({ name: "clientinfo", params: { clid: 3 } });
    void tracker.command("clientlist -uid -away");
    void tracker.command({
      name: "clientpoke",
      params: [
        ["clid", 3],
        ["msg", "hi there"],
      ],
    });
    expect(sent).toEqual([
      "clientinfo clid=3 return_code=1",
      "clientlist -uid -away return_code=2",
      "clientpoke clid=3 msg=hi\\sthere return_code=3",
    ]);
    expect(tracker.pending).toBe(3);
  });

  // The back-to-back burst of the probe against TS3 3.13.7 and TS6 beta13.1, same order on both.
  it("resolves concurrent commands with their own rows while an error sits in the middle", async () => {
    const { tracker, receive, notifications } = setupTracker();
    const version = tracker.command("version");
    const missing = tracker.command("clientinfo clid=65001");
    const self = tracker.command("clientinfo clid=3");
    const mute = tracker.command("clientupdate client_input_muted=0");
    tracker.send("clientupdate client_away=0");
    const second = tracker.command("version");

    receive("version=3.13.7 build=1655727713 platform=Linux");
    receive(ok(1));
    receive("error id=512 msg=invalid\\sclientID return_code=2");
    receive("cid=1 client_idle_time=6922 client_nickname=WebSpeak\\sprobe");
    receive(ok(3));
    receive("notifyclientupdated clid=3 client_input_muted=0");
    receive(ok(4));
    receive("notifyclientupdated clid=3 client_away=0");
    receive("version=3.13.7 build=1655727713 platform=Linux");
    receive(ok(5));

    await expect(version).resolves.toEqual([{ version: "3.13.7", build: "1655727713", platform: "Linux" }]);
    const error = await missing.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TeamSpeakServerError);
    expect(error).toMatchObject({ id: 512, serverMessage: "invalid clientID", returnCode: "2" });
    await expect(self).resolves.toEqual([{ cid: "1", client_idle_time: "6922", client_nickname: "WebSpeak probe" }]);
    await expect(mute).resolves.toEqual([]);
    await expect(second).resolves.toHaveLength(1);
    expect(notifications.map((command) => command.name)).toEqual(["notifyclientupdated", "notifyclientupdated"]);
    expect(tracker.pending).toBe(0);
  });

  it("collects the pipe rows of one answer", async () => {
    const { tracker, receive } = setupTracker();
    const clients = tracker.command("clientlist");
    receive("clid=7 cid=1 client_nickname=WebSpeak\\sprobe client_type=0|clid=6 cid=1 client_nickname=RE_Capture client_type=0");
    receive(ok(1));
    expect((await clients).map((row) => row.clid)).toEqual(["7", "6"]);
  });

  it("sends notifications between answers to the events, including CommandLow ones", async () => {
    const { tracker, receive, notifications } = setupTracker();
    const poke = tracker.command("clientpoke clid=3 msg=probe");
    receive("notifyclientpoke invokerid=3 invokername=WebSpeak\\sprobe msg=probe", true);
    receive("channellist cid=9 cpid=0 channel_name=Late");
    receive("channellistfinished");
    receive(ok(1));
    await expect(poke).resolves.toEqual([]);
    expect(notifications).toEqual([
      { name: "notifyclientpoke", flags: [], rows: [{ invokerid: "3", invokername: "WebSpeak probe", msg: "probe" }], low: true },
      { name: "channellist", flags: [], rows: [{ cid: "9", cpid: "0", channel_name: "Late" }], low: false },
      { name: "channellistfinished", flags: [], rows: [{}], low: false },
    ]);
  });

  it("reads an answer row that starts with a bare key", async () => {
    const { tracker, receive, notifications } = setupTracker();
    const info = tracker.command("clientinfo clid=3");
    receive("client_default_channel cid=1 client_nickname=x");
    receive(ok(1));
    await expect(info).resolves.toEqual([{ client_default_channel: "", cid: "1", client_nickname: "x" }]);
    expect(notifications).toEqual([]);
  });

  // TS6 answers permeffective with a notification that carries the return code (captured).
  it("adds the rows of a notification tagged with a return code to that answer", async () => {
    const { tracker, receive, notifications } = setupTracker();
    const effective = tracker.command("permeffective cldbid=3 cid=1 permid=252|permid=253");
    receive("notifyeffectivepermissions cldbid=3 cid=1 return_code=1 p=252 v=-1|p=253 v=-1");
    receive("notifyclientupdated clid=3 return_code=99");
    receive(ok(1));
    const rows = await effective;
    expect(rows.map((row) => [row.p, row.v, row.cid])).toEqual([
      ["252", "-1", "1"],
      ["253", "-1", "1"],
    ]);
    expect(notifications.map((command) => command.name)).toEqual(["notifyeffectivepermissions", "notifyclientupdated"]);
  });

  it("rejects commands the server answered past and keeps the right rows for the answered one", async () => {
    const { tracker, receive } = setupTracker();
    const skipped = tracker.command("version");
    const answered = tracker.command("clientinfo clid=3");
    receive("cid=1");
    receive(ok(2));
    await expect(skipped).rejects.toMatchObject({ code: "malformedData", message: expect.stringContaining("version") });
    await expect(answered).resolves.toEqual([{ cid: "1" }]);
  });

  it("drops answers nobody waits for and logs them", () => {
    const debug = vi.fn();
    const { receive, notifications } = setupTracker({ logger: { debug } });
    receive("cid=1");
    receive(ok(42));
    receive("error id=0 msg=ok");
    expect(notifications).toEqual([]);
    expect(debug).toHaveBeenCalledTimes(3);
  });

  it("refuses an answer with more rows than allowed and a broken error row", () => {
    const { tracker, receive } = setupTracker({ maxRows: 2 });
    const pending = tracker.command("clientlist");
    pending.catch(() => undefined);
    receive("clid=1|clid=2");
    expect(() => receive("clid=3")).toThrow(TeamSpeakTransportError);
    expect(() => receive("error id=x msg=broken")).toThrow(/no valid id/);
  });

  it("checks raw command text", () => {
    const { tracker, sent } = setupTracker();
    expect(() => tracker.command("version return_code=7")).toThrow(/return_code/);
    expect(() => tracker.command("   ")).toThrow(/empty/);
    void tracker.command("  version  ");
    tracker.send({ name: "setupstream", params: { name: "screen" } });
    expect(sent).toEqual(["version return_code=1", "setupstream name=screen"]);
  });
});
