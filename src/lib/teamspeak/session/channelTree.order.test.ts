import { describe, expect, it } from "vitest";
import type { CommandRow } from "../wire/commandRows.js";
import { ChannelTree } from "./channelTree.js";

const row = (fields: Record<string, string | number>): CommandRow =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]));

/** Top level A, B, C in that order, D below B. */
function tree() {
  const channels = new ChannelTree();
  // Welcome order is not display order.
  channels.add(row({ cid: 3, cpid: 0, channel_order: 2, channel_name: "C" }));
  channels.add(row({ cid: 1, cpid: 0, channel_order: 0, channel_name: "A" }));
  channels.add(row({ cid: 4, cpid: 2, channel_order: 0, channel_name: "D" }));
  channels.add(row({ cid: 2, cpid: 0, channel_order: 1, channel_name: "B" }));
  return channels;
}

const names = (channels: ChannelTree, parentId = 0n) => channels.children(parentId).map((channel) => channel.name);

describe("channel order", () => {
  it("follows the order chain, not the arrival order", () => {
    const channels = tree();
    expect(names(channels)).toEqual(["A", "B", "C"]);
    expect(names(channels, 2n)).toEqual(["D"]);
  });

  it("puts a created channel in its place and relinks the sibling below", () => {
    const channels = tree();
    channels.create(row({ cid: 5, cpid: 0, channel_order: 1, channel_name: "A2", invokerid: 9 }));
    expect(names(channels)).toEqual(["A", "A2", "B", "C"]);
    expect(channels.get(2n)!.order).toBe(5n);
    expect(channels.get(5n)!.properties.invokerid).toBeUndefined();
    channels.create(row({ cid: 6, cpid: 0, channel_order: 0, channel_name: "First" }));
    expect(names(channels)).toEqual(["First", "A", "A2", "B", "C"]);
  });

  it("closes the gap of a moved channel and opens one at the target", () => {
    const channels = tree();
    // notifychannelmoved names the parent `cpid` and the order `order`.
    const moved = channels.edit(row({ cid: 1, cpid: 2, order: 4 }))!;
    expect(moved.previous.parentId).toBe(0n);
    expect(moved.changed).toEqual(["parentId", "order"]);
    expect(names(channels)).toEqual(["B", "C"]);
    expect(names(channels, 2n)).toEqual(["D", "A"]);
    channels.edit(row({ cid: 3, channel_order: 0 }));
    expect(names(channels)).toEqual(["C", "B"]);
  });

  it("keeps the order when an edit changes something else", () => {
    const channels = tree();
    const edited = channels.edit(row({ cid: 2, channel_name: "Bee", channel_topic: "buzz" }))!;
    expect(edited.changed).toEqual(["name", "topic"]);
    expect(names(channels)).toEqual(["A", "Bee", "C"]);
  });

  it("deletes a channel with its subchannels, children first", () => {
    const channels = tree();
    expect(channels.delete(2n).map((channel) => channel.id)).toEqual([4n, 2n]);
    expect(names(channels)).toEqual(["A", "C"]);
    expect(channels.get(3n)!.order).toBe(1n);
    expect(channels.size).toBe(2);
    expect(channels.delete(2n)).toEqual([]);
  });

  it("lists channels the chain does not reach after the others", () => {
    const channels = tree();
    channels.add(row({ cid: 9, cpid: 0, channel_order: 77, channel_name: "Lost" }));
    channels.add(row({ cid: 8, cpid: 0, channel_order: 77, channel_name: "Lost too" }));
    expect(names(channels)).toEqual(["A", "B", "C", "Lost too", "Lost"]);
  });

  it("refuses rows without a usable id and edits of unknown channels", () => {
    const channels = tree();
    expect(channels.add(row({ cid: 0 }))).toBeUndefined();
    expect(channels.create(row({ cid: "x" }))).toBeUndefined();
    expect(channels.edit(row({ cid: 42, channel_name: "?" }))).toBeUndefined();
    expect(channels.setSubscribed(42n, true)).toBeUndefined();
  });

  it("tracks the subscription and keeps it across edits", () => {
    const channels = tree();
    expect(channels.setSubscribed(1n, true)!.subscribed).toBe(true);
    expect(channels.setSubscribed(1n, true)).toBeUndefined();
    expect(channels.edit(row({ cid: 1, channel_name: "A!" }))!.channel.subscribed).toBe(true);
  });

  it("parses the channel fields and keeps every property", () => {
    const channels = new ChannelTree();
    const channel = channels.add(
      row({
        cid: 7,
        pid: 3,
        channel_name: "Music",
        channel_codec: 5,
        channel_codec_quality: 10,
        channel_codec_is_unencrypted: 0,
        channel_flag_password: 1,
        channel_maxclients: "x",
        channel_needed_talk_power: 25,
        channel_unique_identifier: "uuid",
      }),
    )!;
    expect(channel).toMatchObject({
      parentId: 3n,
      order: 0n,
      codec: 5,
      codecQuality: 10,
      codecUnencrypted: false,
      hasPassword: true,
      maxClients: -1,
      neededTalkPower: 25,
      subscribed: false,
    });
    expect(channel.properties.channel_unique_identifier).toBe("uuid");
  });
});
