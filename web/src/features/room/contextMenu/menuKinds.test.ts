import { describe, expect, it } from "vitest";
import { menuItemsFor, menuLabelFor, menuPayloadOf } from "@/features/room/contextMenu/menuKinds";
import ChannelMenuItems from "@/features/room/contextMenu/ChannelMenuItems.vue";
import MemberMenuItems from "@/features/room/contextMenu/MemberMenuItems.vue";
import SelfMenuItems from "@/features/room/contextMenu/SelfMenuItems.vue";
import type { ContextTarget } from "@/features/room/contextMenuApi";
import type { TreeChannel } from "@/features/room/roomTypes";

const t = ((key: string) => key) as Parameters<typeof menuLabelFor>[1];
const ana = { id: 2, nickname: "Ana" };
const lobby = { id: "lobby", name: "Lobby", members: [] } as unknown as TreeChannel;

const targets: ContextTarget[] = [
  { kind: "member", member: ana, x: 1, y: 2 },
  { kind: "self", member: ana, x: 1, y: 2 },
  { kind: "channel", channel: lobby, x: 1, y: 2 },
];

describe("menuKinds", () => {
  it("picks the items component by kind", () => {
    expect(targets.map(menuItemsFor)).toEqual([MemberMenuItems, SelfMenuItems, ChannelMenuItems]);
  });

  it("names the menu after its target", () => {
    expect(targets.map((target) => menuLabelFor(target, t))).toEqual(["Ana", "Ana", "Lobby"]);
  });

  it("hands over the payload only, not the kind or the position", () => {
    expect(targets.map(menuPayloadOf)).toEqual([{ member: ana }, { member: ana }, { channel: lobby }]);
  });
});
