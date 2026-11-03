import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/features/session";
import { buildTimeline, splitAroundName, type Notice, type TimelineItem } from "@/features/room/chat/groupMessages";

// Groups only, for the tests that have no notices.
const groupMessages = (messages: ChatMessage[]) =>
  buildTimeline(messages).map((item) => (item as Extract<TimelineItem, { kind: "group" }>).group);

const msg = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  scope: "channel",
  invokerName: "Ana",
  message: id,
  timestamp: 1000,
  ...extra,
});

describe("groupMessages", () => {
  it("returns nothing for no messages", () => {
    expect(groupMessages([])).toEqual([]);
  });

  it("puts consecutive messages of one sender in one group", () => {
    const groups = groupMessages([msg("1"), msg("2", { timestamp: 2000 }), msg("3", { timestamp: 3000 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("1");
    expect(groups[0]!.messages.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("starts a new group when the sender changes, and again when the first one comes back", () => {
    const groups = groupMessages([msg("1"), msg("2", { invokerName: "Ben" }), msg("3")]);
    expect(groups.map((group) => group.messages.length)).toEqual([1, 1, 1]);
  });

  it("keeps your own messages apart from others, whatever the name", () => {
    const groups = groupMessages([msg("1", { isSelf: true, invokerName: "Ana" }), msg("2", { invokerName: "Ana" })]);
    expect(groups.map((group) => group.isSelf)).toEqual([true, false]);
  });

  it("tells two people with the same name apart by their identity", () => {
    const groups = groupMessages([msg("1", { senderUid: "a" }), msg("2", { senderUid: "b" })]);
    expect(groups).toHaveLength(2);
  });

  it("starts a new group after a long pause", () => {
    const groups = groupMessages([
      msg("1"),
      msg("2", { timestamp: 1000 + 5 * 60 * 1000 }),
      msg("3", { timestamp: 1000 + 5 * 60 * 1000 + 1 + 5 * 60 * 1000 }),
    ]);
    expect(groups.map((group) => group.messages.map((m) => m.id))).toEqual([["1", "2"], ["3"]]);
  });
});

const notice = (id: string, timestamp: number): Notice => ({ id, timestamp, text: id });

describe("buildTimeline", () => {
  const kinds = (items: TimelineItem[]) =>
    items.map((item) => (item.kind === "group" ? `g${item.group.messages.length}` : `n:${item.notice.id}`));

  it("puts a notice between the messages it fell between, and a notice ends a group", () => {
    const items = buildTimeline([msg("1", { timestamp: 1000 }), msg("2", { timestamp: 3000 })], [notice("a", 2000)]);
    expect(kinds(items)).toEqual(["g1", "n:a", "g1"]);
  });

  it("keeps notices that come before the first or after the last message", () => {
    const items = buildTimeline([msg("1", { timestamp: 2000 })], [notice("a", 1000), notice("b", 3000)]);
    expect(kinds(items)).toEqual(["n:a", "g1", "n:b"]);
  });

  it("lists notices alone when there are no messages", () => {
    expect(kinds(buildTimeline([], [notice("a", 1), notice("b", 2)]))).toEqual(["n:a", "n:b"]);
  });
});

describe("splitAroundName", () => {
  it("cuts the text around the name", () => {
    expect(splitAroundName("Ana joined the server", "Ana")).toEqual(["", "Ana", " joined the server"]);
    expect(splitAroundName("Now Ana is here", "Ana")).toEqual(["Now ", "Ana", " is here"]);
  });

  it("leaves the text whole without a name, or when the name is not in it", () => {
    expect(splitAroundName("Connected", undefined)).toEqual(["Connected", "", ""]);
    expect(splitAroundName("Connected", "Ana")).toEqual(["Connected", "", ""]);
  });
});
