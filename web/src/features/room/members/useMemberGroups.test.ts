import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { builtinGroupIcon } from "@/features/room/members/builtinGroupIcons";
import { useMemberGroups } from "@/features/room/members/useMemberGroups";
import { useSessionStore, type ServerGroup } from "@/features/session";

beforeEach(() => setActivePinia(createPinia()));

const GROUPS: ServerGroup[] = [
  { id: 3, name: "Server Admin", iconId: 300 },
  { id: 6, name: "Owner", iconId: 2242180715 },
  { id: 8, name: "Guest", iconId: 0 },
  { id: 9, name: "Friend", iconId: 2303737790 },
];
const CHANNEL_GROUPS: ServerGroup[] = [
  { id: 5, name: "Channel Admin", iconId: 100 },
  { id: 6, name: "Guest", iconId: 0 },
  { id: 7, name: "Regular", iconId: 4000000000 },
];

function setup(icons: Record<number, string>) {
  const session = useSessionStore();
  session.serverGroups = GROUPS;
  session.channelGroups = CHANNEL_GROUPS;
  session.groupIcons = icons;
  return { session, groups: useMemberGroups() };
}

describe("server groups", () => {
  it("lists the groups of a member in the server's order, with built-in and downloaded icons", () => {
    const { groups } = setup({ 2242180715: "data:image/png;base64,AAAA" });
    const { server } = groups.groupsFor({ serverGroups: [6, 3] });
    expect(server.map((group) => group.name)).toEqual(["Server Admin", "Owner"]);
    expect(server[0]!.builtin).toEqual(builtinGroupIcon(300));
    expect(server[1]!.src).toBe("data:image/png;base64,AAAA");
  });

  it("leaves out groups without an icon, with an icon still loading, and ids the list does not know", () => {
    const { groups } = setup({});
    expect(groups.groupsFor({ serverGroups: [8, 6, 9, 77] }).server).toEqual([]);
    expect(groups.groupsFor({}).server).toEqual([]);
  });

  it("follows the icons as they arrive", () => {
    const { groups, session } = setup({});
    expect(groups.groupsFor({ serverGroups: [9] }).server).toEqual([]);
    session.groupIcons = { 2303737790: "data:image/png;base64,BBBB" };
    expect(groups.groupsFor({ serverGroups: [9] }).server.map((group) => group.name)).toEqual(["Friend"]);
  });
});

describe("channel group", () => {
  it("is looked up in its own list, where ids may repeat the server group ids", () => {
    const { groups } = setup({ 4000000000: "data:image/png;base64,CCCC", 2242180715: "data:image/png;base64,AAAA" });
    expect(groups.groupsFor({ channelGroupId: 5 }).channel).toMatchObject({ name: "Channel Admin", builtin: builtinGroupIcon(100) });
    expect(groups.groupsFor({ channelGroupId: 7 }).channel).toMatchObject({ name: "Regular", src: "data:image/png;base64,CCCC" });
    expect(groups.groupsFor({ serverGroups: [6], channelGroupId: 5 }).server.map((group) => group.name)).toEqual(["Owner"]);
  });

  it("is left out without an icon, for a member without one and for an id the list does not know", () => {
    const { groups } = setup({});
    expect(groups.groupsFor({ channelGroupId: 6 }).channel).toBeUndefined();
    expect(groups.groupsFor({ channelGroupId: 7 }).channel).toBeUndefined();
    expect(groups.groupsFor({}).channel).toBeUndefined();
    expect(groups.groupsFor({ channelGroupId: 99 })).toEqual({ server: [] });
  });
});

describe("builtinGroupIcon", () => {
  it.each([0, -1, 1000, 2242180715, 1.5])("has no built-in icon for %s", (id) => {
    expect(builtinGroupIcon(id)).toBeUndefined();
  });

  it("falls back to a generic glyph for a built-in id without artwork", () => {
    expect(builtinGroupIcon(123)).toMatchObject({ icon: "users" });
    expect(builtinGroupIcon(300)).toMatchObject({ icon: "shield" });
  });

  it("draws the default Voice group as a handheld microphone and the server query group as a server", () => {
    expect(builtinGroupIcon(600)).toMatchObject({ icon: "mic-handheld" });
    expect(builtinGroupIcon(500)).toMatchObject({ icon: "server" });
  });
});
