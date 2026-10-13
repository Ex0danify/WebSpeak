import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { member, mountUseChannelTree } from "@/testSupport/channelTreeFixture";

beforeEach(() => {
  useToast().dismiss();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("channelTree", () => {
  it("orders top-level channels and attaches members with isSelf", async () => {
    const { vm } = await mountUseChannelTree();
    expect(vm.channelTree.map((item) => item.id)).toEqual(["lobby", "raid"]);
    expect(vm.channelTree[0].depth).toBe(0);
    expect(vm.channelTree[0].members[0]).toMatchObject({ id: 1, isSelf: true });
  });

  it("computes depth from parentID chains", async () => {
    const { vm, channels } = await mountUseChannelTree();
    channels.push({ id: "raid-sub", parentID: "raid", name: "Raid Sub" });
    await flushPromises();
    const sub = vm.channelTree.find((item) => item.id === "raid-sub");
    expect(sub?.depth).toBe(1);
  });
});

describe("currentChannel", () => {
  it("prefers the explicitly selected channel", async () => {
    const { vm, options } = await mountUseChannelTree();
    options.selectedChannelId.value = "raid";
    await flushPromises();
    expect(vm.currentChannel?.id).toBe("raid");
  });

  it("falls back to the channel containing the local client", async () => {
    const { vm } = await mountUseChannelTree();
    // tsClientId 1 (Lucas) is in "lobby"; nothing explicitly selected yet.
    await flushPromises();
    expect(vm.currentChannel?.id).toBe("lobby");
  });

  it("falls back to the typed channel name, then the first channel", async () => {
    const { vm, options, voiceState } = await mountUseChannelTree();
    voiceState.tsClientId = 999;
    options.channel.value = "Raid";
    await flushPromises();
    expect(vm.currentChannel?.id).toBe("raid");
  });
});

describe("selectChannel / selectChannelById / channelLabel", () => {
  it("selectChannel asks the gateway and leaves the view on the current channel until the join succeeded", async () => {
    const { vm, options } = await mountUseChannelTree();
    options.selectedChannelId.value = "lobby";
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    expect(options.switchChannel).toHaveBeenCalledWith("raid");
    expect(options.selectedChannelId.value).toBe("lobby");
    expect(options.channel.value).toBe("");
    expect(options.chatTab.value).toBe("server");
  });

  it("selectChannel waits for the member list after the gateway confirmed, so the new channel never shows without you in it", async () => {
    const { vm, options, voiceState, channels } = await mountUseChannelTree();
    options.selectedChannelId.value = "lobby";
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    voiceState.channelSwitchedChannelId = "raid";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("lobby");
    const [lobby, raid] = channels;
    raid.members!.push(lobby.members!.shift()!);
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("raid");
    expect(options.channel.value).toBe("Raid");
    expect(options.chatTab.value).toBe("channel");
  });

  it("selectChannel still follows after a short grace when the member list never shows you in the channel", async () => {
    vi.useFakeTimers();
    try {
      const { vm, options, voiceState } = await mountUseChannelTree();
      options.selectedChannelId.value = "lobby";
      vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
      voiceState.channelSwitchedChannelId = "raid";
      await vi.advanceTimersByTimeAsync(1000);
      expect(options.selectedChannelId.value).toBe("lobby");
      await vi.advanceTimersByTimeAsync(1000);
      expect(options.selectedChannelId.value).toBe("raid");
    } finally {
      vi.useRealTimers();
    }
  });

  it("selectChannel follows at once when the gateway confirms a channel you are already in", async () => {
    const { vm, options, voiceState } = await mountUseChannelTree();
    options.selectedChannelId.value = "raid";
    vm.selectChannel(vm.channelTree.find((item) => item.id === "lobby")!);
    voiceState.channelSwitchedChannelId = "lobby";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("lobby");
  });

  it("selectChannel also follows when the member list shows you in the new channel first", async () => {
    const { vm, options, channels } = await mountUseChannelTree();
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    const [lobby, raid] = channels;
    raid.members!.push(lobby.members!.shift()!);
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("raid");
    expect(options.chatTab.value).toBe("channel");
  });

  it("selectChannelById looks up the selected id and delegates to selectChannel", async () => {
    const { vm, options } = await mountUseChannelTree();
    options.selectedChannelId.value = "raid";
    await flushPromises();
    vm.selectChannelById();
    expect(options.switchChannel).toHaveBeenCalledWith("raid");
  });

  it("channelLabel indents by depth with full-width spaces", async () => {
    const { vm, channels } = await mountUseChannelTree();
    channels.push({ id: "raid-sub", parentID: "raid", name: "Raid Sub" });
    await flushPromises();
    const sub = vm.channelTree.find((item) => item.id === "raid-sub")!;
    expect(vm.channelLabel(sub)).toBe("　Raid Sub");
  });
});

describe("toggleAway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flips away, prompts for a message and reports both to the server", async () => {
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "back in 5"),
    );
    const { vm, options } = await mountUseChannelTree();
    expect(vm.away).toBe(false);
    await vm.toggleAway();
    expect(vm.away).toBe(true);
    expect(options.setAway).toHaveBeenCalledWith(true, "back in 5");
  });

  it("clears the message and reports available without prompting again", async () => {
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "back in 5"),
    );
    const { vm, options } = await mountUseChannelTree();
    await vm.toggleAway();
    vi.mocked(window.prompt).mockClear();
    await vm.toggleAway();
    expect(vm.away).toBe(false);
    expect(window.prompt).not.toHaveBeenCalled();
    expect(options.setAway).toHaveBeenLastCalledWith(false, "");
  });

  it("treats a dismissed prompt as an empty message", async () => {
    vi.stubGlobal(
      "prompt",
      vi.fn(() => null),
    );
    const { vm, options } = await mountUseChannelTree();
    await vm.toggleAway();
    expect(options.setAway).toHaveBeenCalledWith(true, "");
  });
});

describe("filteredMemberChannels", () => {
  it("matches by channel name or member nickname", async () => {
    const { vm } = await mountUseChannelTree();
    vm.memberQuery = "ana";
    await flushPromises();
    expect(vm.filteredMemberChannels.map((item) => item.id)).toEqual(["raid"]);

    vm.memberQuery = "lob";
    await flushPromises();
    expect(vm.filteredMemberChannels.map((item) => item.id)).toEqual(["lobby"]);
  });
});

describe("channel password dialog", () => {
  it("opens when the gateway reports CHANNEL_PASSWORD_REQUIRED for the selected channel", async () => {
    const { vm, options, voiceState } = await mountUseChannelTree();
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    voiceState.errorCode = "CHANNEL_PASSWORD_REQUIRED";
    await flushPromises();
    expect(vm.channelPasswordDialog.open).toBe(true);
    expect(vm.channelPasswordDialog.channelId).toBe("raid");
    expect(options.clearError).toHaveBeenCalled();
  });

  it("submitChannelPassword calls switchChannel with the channel id and password", async () => {
    const { vm, options } = await mountUseChannelTree();
    vm.channelPasswordDialog.open = true;
    vm.channelPasswordDialog.channelId = "raid";
    vm.channelPasswordDialog.password = "secret";
    await flushPromises();
    vm.submitChannelPassword();
    expect(options.switchChannel).toHaveBeenCalledWith("raid", "secret");
  });

  it("cancelChannelPassword leaves the view on the client's own channel and clears the dialog", async () => {
    const { vm, options } = await mountUseChannelTree();
    options.selectedChannelId.value = "lobby";
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    vm.channelPasswordDialog.open = true;
    vm.channelPasswordDialog.channelId = "raid";
    await flushPromises();
    vm.cancelChannelPassword();
    expect(vm.channelPasswordDialog.open).toBe(false);
    expect(options.selectedChannelId.value).toBe("lobby");
    expect(options.clearError).toHaveBeenCalled();
  });

  it("closes once the gateway confirms the channel switch", async () => {
    const { vm, voiceState } = await mountUseChannelTree();
    vm.channelPasswordDialog.open = true;
    vm.channelPasswordDialog.channelId = "raid";
    await flushPromises();
    voiceState.channelSwitchedChannelId = "raid";
    await flushPromises();
    expect(vm.channelPasswordDialog.open).toBe(false);
  });
});

describe("moveMemberDirect", () => {
  it("does nothing for the local member", async () => {
    const { vm, options } = await mountUseChannelTree();
    await vm.moveMemberDirect({ ...member(1, "Lucas"), isSelf: true }, "raid");
    expect(options.moveClient).not.toHaveBeenCalled();
  });

  it("clears the member menu without moving when already in the target channel", async () => {
    const { vm, options } = await mountUseChannelTree();
    options.memberMenu.value = { member: member(2, "Ana"), x: 0, y: 0 };
    await vm.moveMemberDirect(member(2, "Ana"), "raid");
    expect(options.moveClient).not.toHaveBeenCalled();
    expect(options.memberMenu.value).toBeNull();
  });

  it("moves the member and toasts success", async () => {
    const { vm, options } = await mountUseChannelTree();
    options.memberMenu.value = { member: member(2, "Ana"), x: 0, y: 0 };
    await vm.moveMemberDirect(member(2, "Ana"), "lobby");
    expect(options.moveClient).toHaveBeenCalledWith(2, "lobby");
    expect(options.memberMenu.value).toBeNull();
    expect(useToast().toasts.value.at(-1)).toMatchObject({ variant: "success" });
  });

  it("toasts danger on failure", async () => {
    const { vm } = await mountUseChannelTree({
      moveClient: vi.fn(async () => {
        throw new Error("nope");
      }),
    });
    await vm.moveMemberDirect(member(2, "Ana"), "lobby");
    expect(useToast().toasts.value.at(-1)).toMatchObject({ variant: "danger" });
  });
});

describe("drag and drop", () => {
  function dragEvent(): DragEvent {
    return { preventDefault: vi.fn(), dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } } as unknown as DragEvent;
  }

  it("onMemberDragStart/End track the dragged member", async () => {
    const { vm } = await mountUseChannelTree();
    const ana = member(2, "Ana");
    vm.onMemberDragStart(ana, dragEvent());
    expect(vm.draggedMember).toEqual(ana);
    vm.onMemberDragEnd();
    expect(vm.draggedMember).toBeNull();
  });

  it("onMemberDragStart prevents dragging the local member", async () => {
    const { vm } = await mountUseChannelTree();
    const event = dragEvent();
    vm.onMemberDragStart({ ...member(1, "Lucas"), isSelf: true }, event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(vm.draggedMember).toBeNull();
  });

  it("onChannelDragOver highlights a channel that isn't the dragged member's own", async () => {
    const { vm } = await mountUseChannelTree();
    vm.onMemberDragStart(member(2, "Ana"), dragEvent());
    const lobby = vm.channelTree.find((item) => item.id === "lobby")!;
    const event = dragEvent();
    vm.onChannelDragOver(lobby, event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(vm.dragOverChannelId).toBe("lobby");
  });

  it("onChannelDrop moves the dragged member into the dropped channel", async () => {
    const { vm, options } = await mountUseChannelTree();
    vm.onMemberDragStart(member(2, "Ana"), dragEvent());
    const lobby = vm.channelTree.find((item) => item.id === "lobby")!;
    vm.onChannelDrop(lobby, dragEvent());
    await flushPromises();
    expect(options.moveClient).toHaveBeenCalledWith(2, "lobby");
    expect(vm.draggedMember).toBeNull();
  });
});

describe("spacers", () => {
  it("marks spacer channels and keeps them out of joins, moves and search", async () => {
    const { vm, channels } = await mountUseChannelTree();
    channels.unshift({ id: "sp", parentID: "0", name: "[cspacer]Games" });
    await flushPromises();
    expect(vm.channelTree.find((item) => item.id === "sp")?.spacer).toEqual({ align: "center", text: "Games" });
    expect(vm.currentChannel?.id).not.toBe("sp");
    vm.memberQuery = "games";
    await flushPromises();
    expect(vm.filteredMemberChannels.some((item) => item.id === "sp")).toBe(false);
  });
});
