import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import type { ChannelInfo, ChannelMember, VoiceState } from "@/features/session";

type Exposed = {
  memberQuery: string;
  away: boolean;
  toggleAway: () => Promise<void>;
  channelTree: Array<ChannelInfo & { depth: number; members: ChannelMember[] }>;
  currentChannel: (ChannelInfo & { depth: number; members: ChannelMember[] }) | undefined;
  ownChannelId: string;
  currentChannelName: string;
  currentChannelDescription: string;
  currentMembers: ChannelMember[];
  roomMembers: ChannelMember[];
  memberChannels: Array<ChannelInfo & { depth: number; members: ChannelMember[] }>;
  filteredMemberChannels: Array<ChannelInfo & { depth: number; members: ChannelMember[] }>;
  selectChannel: (item: ChannelInfo & { depth: number; members: ChannelMember[] }) => void;
  selectChannelById: () => void;
  channelLabel: (item: ChannelInfo & { depth: number }) => string;
  channelPasswordDialog: { open: boolean; channelId: string; password: string; error: string; submitting: boolean };
  submitChannelPassword: () => void;
  cancelChannelPassword: () => void;
  draggedMember: ChannelMember | null;
  dragOverChannelId: string;
  onMemberDragStart: (member: ChannelMember, event: DragEvent) => void;
  onMemberDragEnd: () => void;
  onChannelDragOver: (channelItem: ChannelInfo & { depth: number; members: ChannelMember[] }, event: DragEvent) => void;
  onChannelDragLeave: (channelItem: ChannelInfo & { depth: number; members: ChannelMember[] }, event: DragEvent) => void;
  onChannelDrop: (channelItem: ChannelInfo & { depth: number; members: ChannelMember[] }, event: DragEvent) => void;
  moveMemberDirect: (member: ChannelMember, targetChannelId: string) => Promise<void>;
  memberMoveMenuCurrentChannel: (ChannelInfo & { depth: number; members: ChannelMember[] }) | null;
  memberMoveMenuCurrentSameChannel: boolean;
  memberMoveMenuOtherChannels: Array<ChannelInfo & { depth: number; members: ChannelMember[] }>;
};

function member(id: number, nickname: string): ChannelMember {
  return { id, nickname };
}

function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
  return reactive({
    connected: true,
    connecting: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectFailed: false,
    tsClientId: 1,
    error: "",
    errorCode: "",
    microphoneError: "",
    microphoneErrorCode: "",
    audioNotice: "",
    audioNoticeCode: "",
    channelSwitchedChannelId: "",
    ...overrides,
  }) as VoiceState;
}

async function mountUseChannelTree(overrides: Record<string, unknown> = {}) {
  const { useChannelTree } = await import("./useChannelTree");
  const voiceState = makeVoiceState();
  const channels = reactive<ChannelInfo[]>([
    { id: "lobby", parentID: "0", name: "Lobby", members: [member(1, "Lucas")] },
    { id: "raid", parentID: "0", name: "Raid", members: [member(2, "Ana")] },
  ]);
  const members = reactive<ChannelMember[]>([member(1, "Lucas"), member(2, "Ana")]);
  const options = {
    voiceState,
    channels,
    members,
    channel: ref(""),
    selectedChannelId: ref(""),
    chatTab: ref<"channel" | "server" | "private" | "events">("server"),
    memberMenu: ref<{ member: ChannelMember; x: number; y: number } | null>(null),
    switchChannel: vi.fn(),
    moveClient: vi.fn(async () => undefined),
    clearError: vi.fn(),
    setAway: vi.fn(),
    ...overrides,
  };
  const wrapper = mount(
    defineComponent({
      setup: () =>
        useChannelTree({
          ...options,
          session: { state: options.voiceState, clearError: options.clearError },
          roster: options,
          actions: options,
        }),
      template: "<div/>",
    }),
  );
  await flushPromises();
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options, voiceState, channels, members };
}

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
  it("selectChannel updates selection, channel name, chat tab and calls switchChannel", async () => {
    const { vm, options } = await mountUseChannelTree();
    const raid = vm.channelTree.find((item) => item.id === "raid")!;
    vm.selectChannel(raid);
    expect(options.selectedChannelId.value).toBe("raid");
    expect(options.channel.value).toBe("Raid");
    expect(options.chatTab.value).toBe("channel");
    expect(options.switchChannel).toHaveBeenCalledWith("raid");
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
    options.selectedChannelId.value = "raid";
    await flushPromises();
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

  it("cancelChannelPassword restores the client's own channel and clears the dialog", async () => {
    const { vm, options } = await mountUseChannelTree();
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

describe("a refused channel switch", () => {
  it("puts the selection and the channel name back on the channel you are still in", async () => {
    const { vm, options, voiceState, channels } = await mountUseChannelTree();
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    expect(options.selectedChannelId.value).toBe("raid");
    expect(options.channel.value).toBe("Raid");
    voiceState.errorCode = "CHANNEL_FULL";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("lobby");
    expect(options.channel.value).toBe("Lobby");
    expect(channels).toHaveLength(2);
  });

  it("tells the user why, and clears the session error", async () => {
    const { vm, options, voiceState } = await mountUseChannelTree();
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    voiceState.error = "You do not have permission to perform this action";
    voiceState.errorCode = "PERMISSION_DENIED";
    await flushPromises();
    expect(useToast().toasts.value.at(-1)).toMatchObject({ variant: "danger", title: "You do not have permission to perform this action" });
    expect(options.clearError).toHaveBeenCalled();
  });

  it("leaves the selection alone once the move went through, and for a password request", async () => {
    const { vm, options, voiceState } = await mountUseChannelTree();
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    voiceState.channelSwitchedChannelId = "raid";
    await flushPromises();
    voiceState.errorCode = "PERMISSION_DENIED";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("raid");
    voiceState.errorCode = "";
    vm.selectChannel(vm.channelTree.find((item) => item.id === "lobby")!);
    voiceState.errorCode = "CHANNEL_PASSWORD_REQUIRED";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("lobby");
    expect(vm.channelPasswordDialog.open).toBe(true);
  });
});

describe("toggleAway and the gateway", () => {
  it("keeps the new away state once the gateway accepted it", async () => {
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "lunch"),
    );
    const { vm, options } = await mountUseChannelTree();
    await vm.toggleAway();
    expect(options.setAway).toHaveBeenCalledWith(true, "lunch");
    expect(vm.away).toBe(true);
  });

  it("goes back to the previous state and toasts when the gateway refuses", async () => {
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "lunch"),
    );
    const setAway = vi.fn(async () => {
      throw new LocalizedError(text("err_PERMISSION_DENIED"), "PERMISSION_DENIED");
    });
    const { vm } = await mountUseChannelTree({ setAway });
    await vm.toggleAway();
    expect(vm.away).toBe(false);
    expect(useToast().toasts.value.at(-1)).toMatchObject({ variant: "danger" });
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
