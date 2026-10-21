import { describe, expect, it } from "vitest";
import { cmd, enter, startSession, WELCOME_CHANNELS } from "../../../../test/support/tsSessionScript.js";
import { ReasonId } from "./sessionEvents.js";

const admin = { invokerid: 9, invokername: "Admin", invokeruid: "admin=" };

/** Welcome done: we are 5 in Lobby, 6 sits in Talk. */
function welcomed() {
  const script = startSession(5);
  for (const text of WELCOME_CHANNELS) script.feed(text);
  script.feed(
    cmd(
      "notifycliententerview",
      { cfid: 0, ctid: 1, reasonid: 2, clid: 5, client_nickname: "Me" },
      { clid: 6, ctid: 2, client_nickname: "Bob" },
    ),
  );
  script.events.length = 0;
  return script;
}

describe("clients", () => {
  it("moves a client and reports where it came from", () => {
    const { session, feed } = welcomed();
    expect(feed(cmd("notifyclientmoved", { ctid: 3, reasonid: 0, clid: 6 }))).toEqual([
      {
        type: "clientMoved",
        client: expect.objectContaining({ id: 6, channelId: 3n }),
        fromChannelId: 2n,
        reasonId: 0,
        invoker: undefined,
      },
    ]);
    expect(session.client(6)!.channelId).toBe(3n);
  });

  it("moves every client of a batched move", () => {
    const { session, feed } = welcomed();
    feed(enter(7, 1, "Carol"));
    const events = feed(cmd("notifyclientmoved", { ctid: 2, reasonid: 1, clid: 7, ...admin }, { clid: 5 }));
    expect(events.map((event) => event.type === "clientMoved" && [event.client.id, event.invoker?.name])).toEqual([
      [7, "Admin"],
      [5, "Admin"],
    ]);
    expect(session.self.channelId).toBe(2n);
  });

  it("follows us when an admin moves us", () => {
    const { session, feed } = welcomed();
    const [moved] = feed(cmd("notifyclientmoved", { ctid: 3, reasonid: ReasonId.movedByOther, clid: 5, ...admin }));
    expect(moved).toMatchObject({ type: "clientMoved", reasonId: 1, invoker: { id: 9, name: "Admin", uid: "admin=" } });
    expect(session.self).toMatchObject({ clientId: 5, channelId: 3n });
    expect(session.snapshot().clients.find((client) => client.id === 5)!.channelID).toBe(3n);
  });

  it("reports a channel kick as a move with its reason", () => {
    const { session, feed } = welcomed();
    const [moved] = feed(cmd("notifyclientmoved", { ctid: 1, reasonid: ReasonId.kickedFromChannel, reasonmsg: "out", clid: 6, ...admin }));
    expect(moved).toMatchObject({ type: "clientMoved", reasonId: 4, fromChannelId: 2n });
    expect(session.client(6)!.channelId).toBe(1n);
  });

  it("updates properties and names what changed", () => {
    const { session, feed } = welcomed();
    const [updated] = feed(cmd("notifyclientupdated", { clid: 6, client_input_muted: 1, client_away: 0, client_meta_data: "x" }));
    expect(updated).toMatchObject({ type: "clientUpdated", client: { id: 6, inputMuted: true }, changed: ["inputMuted"] });
    expect(session.client(6)!.properties.client_meta_data).toBe("x");
    expect(session.client(6)!.channelId).toBe(2n);
  });

  it("takes the channel group of a join", () => {
    const { session, feed } = welcomed();
    const changed = { invokerid: 0, invokername: "Server", cgid: 8, cid: 2, clid: 6, cgi: 2 };
    expect(feed(cmd("notifyclientchannelgroupchanged", changed))).toMatchObject([
      { type: "clientUpdated", client: { id: 6, channelGroupId: 8 }, changed: ["channelGroupId"] },
    ]);
    expect(feed(cmd("notifyclientchannelgroupchanged", changed))).toEqual([]);
    expect(feed(cmd("notifyclientchannelgroupchanged", { clid: 6 }))).toEqual([]);
    expect(session.client(6)!.channelGroupId).toBe(8);
  });

  it("removes a client that leaves", () => {
    const { session, feed } = welcomed();
    expect(feed(cmd("notifyclientleftview", { cfid: 2, ctid: 0, reasonid: 8, reasonmsg: "bye", clid: 6 }))).toEqual([
      {
        type: "clientLeave",
        client: expect.objectContaining({ id: 6, nickname: "Bob" }),
        toChannelId: 0n,
        reasonId: 8,
        reasonMessage: "bye",
        invoker: undefined,
      },
    ]);
    expect(session.client(6)).toBeUndefined();
  });

  it("removes a client that went to a channel out of view", () => {
    const { session, feed } = welcomed();
    const [left] = feed(cmd("notifyclientleftview", { cfid: 2, ctid: 3, reasonid: 0, clid: 6 }));
    expect(left).toMatchObject({ type: "clientLeave", toChannelId: 3n });
    expect(session.client(6)).toBeUndefined();
  });

  it("brings a client back with what it had", () => {
    const { session, feed } = welcomed();
    feed(cmd("notifyclientupdated", { clid: 6, client_away: 1 }));
    feed(enter(6, 3, "Bob"));
    expect(session.client(6)).toMatchObject({ channelId: 3n, away: true });
  });

  it("ignores rows for clients it does not know", () => {
    const { feed } = welcomed();
    expect(feed(cmd("notifyclientmoved", { ctid: 2, reasonid: 0, clid: 77 }))).toEqual([]);
    expect(feed(cmd("notifyclientmoved", { ctid: "x", reasonid: 0, clid: 6 }))).toEqual([]);
    expect(feed(cmd("notifyclientupdated", { clid: 77, client_away: 1 }))).toEqual([]);
    expect(feed(cmd("notifyclientleftview", { ctid: 0, reasonid: 8, clid: 77 }))).toEqual([]);
    expect(feed(cmd("notifyclientleftview", { ctid: 0, reasonid: 8, clid: "x" }))).toEqual([]);
    expect(feed(enter(0, 1, "nobody"))).toEqual([]);
  });
});

describe("our own leave", () => {
  it.each([
    [ReasonId.kickedFromServer, { reasonmsg: "behave" }, undefined],
    [ReasonId.banned, { reasonmsg: "gone", bantime: 600 }, 600],
    [ReasonId.leaving, { reasonmsg: "leaving" }, undefined],
  ])("reports reason %i with message and invoker", (reasonId, fields, banTime) => {
    const { session, feed } = welcomed();
    const events = feed(cmd("notifyclientleftview", { cfid: 1, ctid: 0, reasonid: reasonId, clid: 5, ...admin, ...fields }));
    expect(events.map((event) => event.type)).toEqual(["clientLeave", "selfLeft"]);
    expect(events[1]).toEqual({
      type: "selfLeft",
      reasonId,
      reasonMessage: fields.reasonmsg,
      invoker: { id: 9, name: "Admin", uid: "admin=" },
      banTime,
    });
    expect(session.self.client).toBeUndefined();
  });

  it("reports it even before our enter view", () => {
    const { feed } = startSession(5);
    expect(feed(cmd("notifyclientleftview", { reasonid: 5, clid: 5 }))).toMatchObject([
      { type: "selfLeft", reasonId: 5, reasonMessage: "" },
    ]);
  });
});

describe("channels", () => {
  it("drops the clients the server left in a deleted channel", () => {
    const { session, feed } = welcomed();
    feed(cmd("notifychannelcreated", { cid: 4, cpid: 2, channel_order: 0, channel_name: "Deep", ...admin }));
    feed(cmd("notifyclientmoved", { ctid: 4, reasonid: 0, clid: 6 }));
    const [deleted] = feed(cmd("notifychanneldeleted", { cid: 2, ...admin }));
    expect(deleted).toMatchObject({ type: "channelDeleted", invoker: { name: "Admin" } });
    if (deleted.type !== "channelDeleted") throw new Error("expected a channel delete");
    expect(deleted.channels.map((channel) => channel.id)).toEqual([4n, 2n]);
    expect(deleted.clients.map((client) => client.id)).toEqual([6]);
    expect(session.client(6)).toBeUndefined();
    expect(session.children(1n)).toEqual([]);
    expect(feed(cmd("notifychanneldeleted", { cid: 2 }))).toEqual([]);
  });

  it("keeps us when our channel goes, the server moves us next", () => {
    const { session, feed } = welcomed();
    const [deleted] = feed(cmd("notifychanneldeleted", { cid: 1 }));
    // Bob sat in the subchannel.
    expect(deleted).toMatchObject({ type: "channelDeleted", clients: [{ id: 6 }] });
    expect(session.self.client).toBeDefined();
  });

  it("creates, edits and moves channels", () => {
    const { session, feed } = welcomed();
    expect(feed(cmd("notifychannelcreated", { cid: 4, cpid: 0, channel_order: 1, channel_name: "New", ...admin }))).toMatchObject([
      { type: "channelCreated", channel: { id: 4n, name: "New" }, invoker: { id: 9 } },
    ]);
    expect(session.children(0n).map((channel) => channel.name)).toEqual(["Lobby", "New", "AFK"]);
    expect(feed(cmd("notifychanneledited", { cid: 4, reasonid: 10, channel_name: "Newer", ...admin }))).toMatchObject([
      { type: "channelEdited", channel: { name: "Newer" }, changed: ["name"] },
    ]);
    expect(feed(cmd("notifychannelmoved", { cid: 4, cpid: 1, order: 2, reasonid: 1, ...admin }))).toMatchObject([
      { type: "channelMoved", channel: { parentId: 1n, order: 2n }, fromParentId: 0n },
    ]);
    expect(session.children(1n).map((channel) => channel.name)).toEqual(["Talk", "Newer"]);
    expect(session.channel(4n)!.properties.channel_name).toBe("Newer");
    expect(feed(cmd("notifychanneledited", { cid: 99, channel_name: "?" }))).toEqual([]);
    expect(feed(cmd("notifychannelmoved", { cid: 99, cpid: 0, order: 0 }))).toEqual([]);
    expect(feed(cmd("notifychannelcreated", { cid: 0 }))).toEqual([]);
  });

  it("drops the clients of an unsubscribed channel but never us", () => {
    const { session, feed } = welcomed();
    expect(feed(cmd("notifychannelsubscribed", { cid: 2, es: 5 }, { cid: 3, es: 9 }, { cid: 42 }))).toMatchObject([
      {
        type: "channelsSubscribed",
        channels: [
          { id: 2n, subscribed: true },
          { id: 3n, subscribed: true },
        ],
      },
    ]);
    expect(feed(cmd("notifychannelsubscribed", { cid: 2 }))).toEqual([]);
    feed(cmd("notifyclientmoved", { ctid: 3, reasonid: 0, clid: 5 }));
    const [unsubscribed] = feed(cmd("notifychannelunsubscribed", { cid: 2 }, { cid: 3 }));
    expect(unsubscribed).toMatchObject({ type: "channelsUnsubscribed", channels: [{ id: 2n }, { id: 3n }], clients: [{ id: 6 }] });
    expect(session.clients().map((client) => client.id)).toEqual([5]);
    expect(feed(cmd("notifychannelunsubscribed", { cid: 2 }))).toEqual([]);
  });
});

describe("server and messages", () => {
  it("merges server updates and edits", () => {
    const { session, feed } = welcomed();
    expect(feed(cmd("notifyserverupdated", { virtualserver_maxclients: 64, virtualserver_clientsonline: 2 }))).toMatchObject([
      { type: "serverUpdated", changed: ["maxClients"], invoker: undefined },
    ]);
    const [edited] = feed(cmd("notifyserveredited", { reasonid: 10, virtualserver_name: "Renamed", ...admin }));
    expect(edited).toMatchObject({ type: "serverUpdated", server: { name: "Renamed", maxClients: 64 }, invoker: { id: 9 } });
    expect(session.server.properties.virtualserver_clientsonline).toBe("2");
    expect(session.server.properties.invokerid).toBeUndefined();
  });

  it("replaces the group lists", () => {
    const { session, feed } = welcomed();
    feed(cmd("notifyservergrouplist", { sgid: 6, name: "Admin", type: 1, iconid: -1, sortid: 3 }, { sgid: "x" }));
    expect(feed(cmd("notifyservergrouplist", { sgid: 8, name: "Guest", type: 1, iconid: 300 }))).toEqual([
      { type: "groupsUpdated", kind: "server" },
    ]);
    expect([...session.serverGroups.values()]).toEqual([
      { id: 8, name: "Guest", type: 1, iconId: 300, sortId: 0, properties: expect.anything() },
    ]);
    feed(cmd("notifychannelgrouplist", { cgid: 5, name: "Channel Admin", iconid: -1 }, { cgid: 8, name: "Guest", iconid: "x" }));
    expect(session.channelGroups.get(5)).toMatchObject({ name: "Channel Admin", type: 1, iconId: 0xffff_ffff });
    expect(session.channelGroups.get(8)).toMatchObject({ name: "Guest", iconId: 0 });
  });

  it("reports text messages and pokes with the invoker", () => {
    const { feed } = welcomed();
    expect(
      feed(cmd("notifytextmessage", { targetmode: 1, msg: "hi there", target: 5, invokerid: 6, invokername: "Bob", invokeruid: "bob=" })),
    ).toEqual([
      { type: "textMessage", targetMode: 1, targetClientId: 5, message: "hi there", invoker: { id: 6, name: "Bob", uid: "bob=" } },
    ]);
    expect(feed(cmd("notifytextmessage", { targetmode: 3, msg: "from the server" }))).toEqual([
      { type: "textMessage", targetMode: 3, targetClientId: undefined, message: "from the server", invoker: { id: 0, name: "", uid: "" } },
    ]);
    expect(feed(cmd("notifyclientpoke", { msg: "psst", invokerid: 6, invokername: "Bob", invokeruid: "bob=" }))).toEqual([
      { type: "poked", message: "psst", invoker: { id: 6, name: "Bob", uid: "bob=" } },
    ]);
  });

  it("hands on what it does not apply, unchanged", () => {
    const { feed } = welcomed();
    const [event] = feed(cmd("notifystreamstarted", { streamid: 3, clid: 6 }));
    expect(event).toMatchObject({ type: "notification", command: { name: "notifystreamstarted", rows: [{ streamid: "3", clid: "6" }] } });
    expect(feed(cmd("toString", { x: 1 }))).toMatchObject([{ type: "notification" }]);
  });
});
