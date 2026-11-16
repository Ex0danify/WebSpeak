import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu } from "@/shared/ui/menu";
import { useSessionStore, type ChannelGroup, type ChannelMember, type ServerGroup } from "@/features/session";
import { provideContextActions, type ContextMenuActions } from "@/features/room/contextMenuApi";
import GroupMenus from "@/features/room/contextMenu/GroupMenus.vue";

const group = (id: number, name: string, extra: Partial<ServerGroup> = {}): ServerGroup => ({
  id,
  name,
  iconId: 0,
  isDefault: false,
  type: 1,
  ...extra,
});

const normal = group(6, "Normal");
const moderator = group(5, "Channel Mod");

const actions = {
  toggleServerGroup: vi.fn(),
  assignChannelGroup: vi.fn(),
} as unknown as ContextMenuActions;

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(actions.toggleServerGroup).mockClear();
  vi.mocked(actions.assignChannelGroup).mockClear();
  // The phone sheet: its submenus expand in place, which a test can click.
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
});

async function openGroupMenus(member: Partial<ChannelMember>) {
  const Host = defineComponent({
    setup() {
      provideContextActions(actions);
      return () =>
        h(Menu, { open: true, label: "Ana" }, () => h(GroupMenus, { member: { id: 2, nickname: "Ana", ...member } as ChannelMember }));
    },
  });
  wrapper = mount(Host, { attachTo: document.body });
  await nextTick();
  await nextTick();
}

const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>("button")];
const button = (name: string) => buttons().find((candidate) => candidate.textContent?.trim() === name)!;
const text = () => document.body.textContent ?? "";

async function expand(name: string) {
  button(name).click();
  await nextTick();
}

function fillLists() {
  const store = useSessionStore();
  store.serverGroups = [normal, group(8, "Guest", { isDefault: true }), group(1, "Template", { type: 0 }), group(2, "Query", { type: 2 })];
  store.channelGroups = [moderator, group(9, "Channel Guest", { isDefault: true }), group(3, "Channel Template", { type: 0 })];
}

describe("GroupMenus", () => {
  it("has a server groups and a channel group submenu", async () => {
    fillLists();
    await openGroupMenus({});
    expect(button("Server groups").getAttribute("aria-expanded")).toBe("false");
    expect(button("Channel group").getAttribute("aria-expanded")).toBe("false");
  });

  it("lists the regular groups to give or take, not the default, template or query ones, ticking those the member has", async () => {
    fillLists();
    await openGroupMenus({ serverGroups: [6, 8] });
    await expand("Server groups");
    const items = buttons().filter((candidate) => candidate.hasAttribute("aria-pressed"));
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Normal"]);
    expect(items[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(text()).not.toMatch(/Guest|Template|Query/);
  });

  it("shows a group the member lacks as not ticked, and hands the choice on", async () => {
    fillLists();
    const member = { serverGroups: [] };
    await openGroupMenus(member);
    await expand("Server groups");
    expect(button("Normal").getAttribute("aria-pressed")).toBe("false");
    button("Normal").click();
    await nextTick();
    expect(actions.toggleServerGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), normal);
  });

  it("marks the member's channel group as the one in effect, and hands the choice on", async () => {
    fillLists();
    await openGroupMenus({ channelGroupId: 5 });
    await expand("Channel group");
    expect(button("Channel Mod").getAttribute("aria-current")).toBe("true");
    expect(text()).not.toMatch(/Channel Guest|Channel Template/);
    button("Channel Mod").click();
    await nextTick();
    expect(actions.assignChannelGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), moderator as ChannelGroup);
  });

  it("shows the icon of a group in front of its name: ours for a built-in id, the download for the rest, an empty square for none", async () => {
    const store = useSessionStore();
    store.serverGroups = [group(6, "Admin", { iconId: 300 }), group(7, "Normal", { iconId: 5000 }), group(9, "Plain", { iconId: 0 })];
    store.groupIcons = { 5000: "data:image/png;base64,AAAA" };
    await openGroupMenus({});
    await expand("Server groups");
    const glyph = (name: string) => button(name).querySelector<HTMLElement>("span.size-4")!;
    expect(glyph("Admin").querySelector("svg")).not.toBeNull();
    expect(glyph("Normal").querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(glyph("Plain").children).toHaveLength(0);
    // The icon comes first, so the names line up whether a group has one or not.
    expect(button("Plain").firstElementChild).toBe(glyph("Plain"));
  });

  it("says there is nothing to assign while the server has sent no groups", async () => {
    await openGroupMenus({});
    await expand("Server groups");
    await expand("Channel group");
    expect(text().match(/No groups to assign/g)).toHaveLength(2);
  });
});
