import { describe, expect, it } from "vitest";
import type { TSDirectorySnapshot } from "../../teamspeak/index.js";
import { avatarDataUrl, isChannelRecord, mapChannelTree, normalizeDirectorySnapshot } from "./voiceDirectoryView.js";

function snapshot(channels: Array<Record<string, unknown>>, clients: Array<Record<string, unknown>>): TSDirectorySnapshot {
  return { channels, clients } as unknown as TSDirectorySnapshot;
}

describe("isChannelRecord", () => {
  it("needs a string id and name", () => {
    expect(isChannelRecord({ id: "1", name: "a" })).toBe(true);
    expect(isChannelRecord({ id: 1, name: "a" })).toBe(false);
    expect(isChannelRecord({ id: "1" })).toBe(false);
    expect(isChannelRecord(null)).toBe(false);
  });
});

describe("avatarDataUrl", () => {
  it.each([
    ["png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"],
    ["gif87a", Buffer.from("GIF87a"), "image/gif"],
    ["gif89a", Buffer.from("GIF89a"), "image/gif"],
    ["webp", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]), "image/webp"],
  ])("detects %s", (_name, data, mime) => {
    expect(avatarDataUrl(data)).toBe(`data:${mime};base64,${data.toString("base64")}`);
  });

  it("returns null for unknown or short data", () => {
    expect(avatarDataUrl(Buffer.from("hello world!"))).toBeNull();
    expect(avatarDataUrl(Buffer.alloc(0))).toBeNull();
  });
});

describe("mapChannelTree", () => {
  const snap = snapshot(
    [{ id: 1n, parentID: 0n, order: 0n, name: "", description: "" }, { id: 2n, parentID: 1n, order: 1n, name: "Two", description: "d" }],
    [
      { id: 7, nickname: "", uid: "u7", channelID: 1n, away: false, awayMessage: "", inputMuted: false, outputMuted: false, channelCommander: false },
      { id: 8, nickname: "Bob", uid: "", channelID: 2n, away: true, awayMessage: "brb", inputMuted: true, outputMuted: true, channelCommander: true },
    ],
  );

  it("stringifies ids, groups members and applies fallbacks", () => {
    const tree = mapChannelTree(snap, new Map([["u7", "data:x"]])) as Array<Record<string, unknown>>;
    expect(tree.map((c) => [c.id, c.parentID, c.order, c.name])).toEqual([["1", "0", "0", ""], ["2", "1", "1", "Two"]]);
    expect(tree[0]!.members).toEqual([
      { id: 7, nickname: "", unnamed: true, uid: "u7", avatar: "data:x", away: false, awayMessage: "", inputMuted: false, outputMuted: false, channelCommander: false },
    ]);
    expect((tree[1]!.members as Array<Record<string, unknown>>)[0]).not.toHaveProperty("avatar");
  });

  it("omits the avatar when the cache holds null", () => {
    const tree = mapChannelTree(snap, new Map([["u7", null]])) as Array<{ members: Array<Record<string, unknown>> }>;
    expect(tree[0]!.members[0]).not.toHaveProperty("avatar");
  });
});

describe("normalizeDirectorySnapshot", () => {
  const channels = [{ id: 1n, name: "Lobby" }, { id: 2n, name: "Game" }];

  it("returns the snapshot untouched while selfId is unknown", () => {
    const snap = snapshot(channels, []);
    expect(normalizeDirectorySnapshot(snap, 0, 0n, "me")).toBe(snap);
  });

  it("adds self to the requested channel by case-insensitive name", () => {
    const out = normalizeDirectorySnapshot(snapshot(channels, []), 5, 0n, "me", " GAME ");
    expect(out.clients).toEqual([{ id: 5, nickname: "me", uid: "", channelID: 2n, type: 1, serverGroups: [] }]);
  });

  it("falls back to the first channel", () => {
    expect(normalizeDirectorySnapshot(snapshot(channels, []), 5, 0n, "me").clients[0]!.channelID).toBe(1n);
  });

  it("prefers the known self channel over the snapshot's", () => {
    const snap = snapshot(channels, [{ id: 5, nickname: "me", uid: "", channelID: 1n }]);
    const out = normalizeDirectorySnapshot(snap, 5, 2n, "me");
    expect(out.clients[0]!.channelID).toBe(2n);
    expect(snap.clients[0]!.channelID).toBe(1n);
  });

  it("keeps the snapshot channel when self is already placed", () => {
    const snap = snapshot(channels, [{ id: 5, nickname: "me", uid: "", channelID: 2n }]);
    expect(normalizeDirectorySnapshot(snap, 5, 0n, "me").clients[0]!.channelID).toBe(2n);
  });
});
