import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore, type ChannelMember, type ServerGroup } from "@/features/session";
import { useGroupChoices } from "@/features/room/contextMenu/useGroupChoices";

const group = (id: number, name: string, extra: Partial<ServerGroup> = {}): ServerGroup => ({
  id,
  name,
  iconId: 0,
  isDefault: false,
  type: 1,
  addPower: 0,
  removePower: 0,
  ...extra,
});
const member = (extra: Partial<ChannelMember> = {}) => ({ id: 2, nickname: "Ana", ...extra }) as ChannelMember;
const names = (groups: ServerGroup[]) => groups.map((entry) => entry.name);

function grant(add: number, remove: number) {
  useSessionStore().permissions = [
    { name: "i_group_member_add_power", value: add },
    { name: "i_group_member_remove_power", value: remove },
  ];
}

beforeEach(() => setActivePinia(createPinia()));

describe("useGroupChoices", () => {
  it("offers regular groups in the server's order, without the default, template and query groups", () => {
    const store = useSessionStore();
    grant(75, 75);
    store.serverGroups = [
      group(7, "Normal"),
      group(8, "Guest", { isDefault: true }),
      group(3, "Admin"),
      group(1, "T", { type: 0 }),
      group(2, "Q", { type: 2 }),
    ];
    expect(names(useGroupChoices().serverFor(member()))).toEqual(["Normal", "Admin"]);
  });

  it("does the same for the channel groups", () => {
    const store = useSessionStore();
    grant(75, 75);
    store.channelGroups = [group(5, "Mod"), group(9, "Guest", { isDefault: true }), group(4, "T", { type: 0 })];
    expect(names(useGroupChoices().channelFor(member()))).toEqual(["Mod"]);
  });

  it("follows the lists as the server sends them, and has nothing before", () => {
    const store = useSessionStore();
    grant(75, 75);
    const choices = useGroupChoices();
    expect(choices.serverFor(member())).toEqual([]);
    store.serverGroups = [group(7, "Normal")];
    expect(choices.serverFor(member())).toHaveLength(1);
  });

  it("offers nothing to a guest the server reported no powers for", () => {
    const store = useSessionStore();
    store.serverGroups = [group(7, "Normal")];
    store.channelGroups = [group(5, "Mod")];
    const choices = useGroupChoices();
    expect(choices.serverFor(member())).toEqual([]);
    expect(choices.channelFor(member())).toEqual([]);
  });

  it("lets an admin with power 75 give Normal (60) but not Admin Server Query (100)", () => {
    const store = useSessionStore();
    grant(75, 75);
    store.serverGroups = [
      group(7, "Normal", { addPower: 60, removePower: 60 }),
      group(2, "Admin Server Query", { addPower: 100, removePower: 100 }),
    ];
    expect(names(useGroupChoices().serverFor(member()))).toEqual(["Normal"]);
  });

  it("checks the remove power for a group the member has, and the add power for one it lacks", () => {
    const store = useSessionStore();
    store.serverGroups = [group(7, "Normal", { addPower: 10, removePower: 90 })];
    grant(75, 75);
    const choices = useGroupChoices();
    expect(names(choices.serverFor(member()))).toEqual(["Normal"]);
    expect(choices.serverFor(member({ serverGroups: [7] }))).toEqual([]);
    grant(75, 95);
    expect(names(choices.serverFor(member({ serverGroups: [7] })))).toEqual(["Normal"]);
  });

  it("needs the remove power to take the channel group a member has, the add power to give another", () => {
    const store = useSessionStore();
    store.channelGroups = [group(5, "Mod", { addPower: 10, removePower: 90 }), group(6, "Op", { addPower: 80, removePower: 10 })];
    grant(75, 75);
    const choices = useGroupChoices();
    expect(names(choices.channelFor(member({ channelGroupId: 5 })))).toEqual([]);
    expect(names(choices.channelFor(member({ channelGroupId: 6 })))).toEqual(["Mod", "Op"]);
  });
});
