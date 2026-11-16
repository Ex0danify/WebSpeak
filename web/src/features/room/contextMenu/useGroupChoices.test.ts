import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore, type ServerGroup } from "@/features/session";
import { useGroupChoices } from "@/features/room/contextMenu/useGroupChoices";

const group = (id: number, name: string, extra: Partial<ServerGroup> = {}): ServerGroup => ({
  id,
  name,
  iconId: 0,
  isDefault: false,
  type: 1,
  ...extra,
});

beforeEach(() => setActivePinia(createPinia()));

describe("useGroupChoices", () => {
  it("offers regular groups in the server's order, without the default, template and query groups", () => {
    const store = useSessionStore();
    store.serverGroups = [
      group(7, "Normal"),
      group(8, "Guest", { isDefault: true }),
      group(3, "Admin"),
      group(1, "T", { type: 0 }),
      group(2, "Q", { type: 2 }),
    ];
    expect(useGroupChoices().server.value.map((entry) => entry.name)).toEqual(["Normal", "Admin"]);
  });

  it("does the same for the channel groups", () => {
    const store = useSessionStore();
    store.channelGroups = [group(5, "Mod"), group(9, "Guest", { isDefault: true }), group(4, "T", { type: 0 })];
    expect(useGroupChoices().channel.value.map((entry) => entry.name)).toEqual(["Mod"]);
  });

  it("follows the lists as the server sends them, and has nothing before", () => {
    const store = useSessionStore();
    const choices = useGroupChoices();
    expect(choices.server.value).toEqual([]);
    store.serverGroups = [group(7, "Normal")];
    expect(choices.server.value).toHaveLength(1);
  });
});
