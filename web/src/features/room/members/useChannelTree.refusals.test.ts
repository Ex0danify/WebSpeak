// What the channel tree does when the gateway refuses a channel switch or an away change.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import type { ChannelInfo } from "@/features/session";
import { mountUseChannelTree } from "@/testSupport/channelTreeFixture";

const dialog = vi.hoisted(() => ({ prompt: vi.fn(), confirm: vi.fn(), alert: vi.fn() }));
vi.mock("@/shared/composables/useDialog", () => ({ useDialog: () => dialog }));

beforeEach(() => {
  useToast().dismiss();
  dialog.prompt.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function movedToRaid(channels: ChannelInfo[]): void {
  const [lobby, raid] = channels;
  raid.members!.push(lobby.members!.shift()!);
}

describe("a refused channel switch", () => {
  it("never shows the refused channel, the view stays on the channel you are in", async () => {
    const { vm, options, voiceState } = await mountUseChannelTree();
    options.selectedChannelId.value = "lobby";
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    expect(options.selectedChannelId.value).toBe("lobby");
    voiceState.errorCode = "CHANNEL_FULL";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("lobby");
    expect(options.channel.value).toBe("");
    expect(options.chatTab.value).toBe("server");
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

  it("keeps the new channel once the move went through, even when a later error arrives", async () => {
    const { vm, options, voiceState, channels } = await mountUseChannelTree();
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    voiceState.channelSwitchedChannelId = "raid";
    movedToRaid(channels);
    await flushPromises();
    voiceState.errorCode = "PERMISSION_DENIED";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("raid");
    expect(useToast().toasts.value).toHaveLength(0);
  });

  it("asks for the password without moving the view", async () => {
    const { vm, options, voiceState, channels } = await mountUseChannelTree();
    options.selectedChannelId.value = "lobby";
    vm.selectChannel(vm.channelTree.find((item) => item.id === "raid")!);
    voiceState.errorCode = "CHANNEL_PASSWORD_REQUIRED";
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("lobby");
    expect(vm.channelPasswordDialog.open).toBe(true);
    expect(vm.channelPasswordDialog.channelId).toBe("raid");
    voiceState.channelSwitchedChannelId = "raid";
    movedToRaid(channels);
    await flushPromises();
    expect(options.selectedChannelId.value).toBe("raid");
    expect(vm.channelPasswordDialog.open).toBe(false);
  });
});

describe("toggleAway and the gateway", () => {
  it("keeps the new away state once the gateway accepted it", async () => {
    dialog.prompt.mockResolvedValue("lunch");
    const { vm, options } = await mountUseChannelTree();
    await vm.toggleAway();
    expect(options.setAway).toHaveBeenCalledWith(true, "lunch");
    expect(vm.away).toBe(true);
  });

  it("goes back to the previous state and toasts when the gateway refuses", async () => {
    dialog.prompt.mockResolvedValue("lunch");
    const setAway = vi.fn(async () => {
      throw new LocalizedError(text("err_PERMISSION_DENIED"), "PERMISSION_DENIED");
    });
    const { vm } = await mountUseChannelTree({ setAway });
    await vm.toggleAway();
    expect(vm.away).toBe(false);
    expect(useToast().toasts.value.at(-1)).toMatchObject({ variant: "danger" });
  });
});
