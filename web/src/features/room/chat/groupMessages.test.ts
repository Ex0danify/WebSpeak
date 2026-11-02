import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/features/session";
import { groupMessages } from "@/features/room/chat/groupMessages";

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
