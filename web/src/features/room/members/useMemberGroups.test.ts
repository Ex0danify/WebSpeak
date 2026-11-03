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

function setup(icons: Record<number, string>) {
  const session = useSessionStore();
  session.serverGroups = GROUPS;
  session.groupIcons = icons;
  return { session, groupsFor: useMemberGroups() };
}

describe("useMemberGroups", () => {
  it("lists the groups of a member in the server's order, with built-in and downloaded icons", () => {
    const { groupsFor } = setup({ 2242180715: "data:image/png;base64,AAAA" });
    const found = groupsFor({ serverGroups: [6, 3] });
    expect(found.map((group) => group.name)).toEqual(["Server Admin", "Owner"]);
    expect(found[0]!.builtin).toEqual(builtinGroupIcon(300));
    expect(found[1]!.src).toBe("data:image/png;base64,AAAA");
  });

  it("leaves out groups without an icon, with an icon still loading, and ids the list does not know", () => {
    const { groupsFor } = setup({});
    expect(groupsFor({ serverGroups: [8, 6, 9, 77] })).toEqual([]);
    expect(groupsFor({})).toEqual([]);
  });

  it("follows the icons as they arrive", () => {
    const { groupsFor, session } = setup({});
    expect(groupsFor({ serverGroups: [9] })).toEqual([]);
    session.groupIcons = { 2303737790: "data:image/png;base64,BBBB" };
    expect(groupsFor({ serverGroups: [9] }).map((group) => group.name)).toEqual(["Friend"]);
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
});
