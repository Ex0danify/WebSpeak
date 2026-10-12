// What the channel tree does when the gateway refuses a channel switch or an away change.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import { mountUseChannelTree } from "@/testSupport/channelTreeFixture";

beforeEach(() => {
  useToast().dismiss();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
