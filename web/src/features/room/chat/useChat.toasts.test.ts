import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissToast, useToast } from "@/shared/composables/useToast";
import type { ChatMessage } from "@/features/session";
import { mountUseChat } from "@/testSupport/chatFixture";

type Muting = { activeChatMuted: boolean; toggleActiveChatMute: () => void };

const message = (extra: Partial<ChatMessage> & Pick<ChatMessage, "id" | "scope">): ChatMessage => ({
  invokerName: "Ana",
  message: "hi",
  timestamp: 1,
  ...extra,
});

describe("chat toasts", () => {
  const { toasts } = useToast();

  beforeEach(() => {
    localStorage.clear();
    dismissToast();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  it("announces a message in a chat that is not open, with the sender and a way to open it", async () => {
    const { options, chatMessages } = await mountUseChat();
    chatMessages.push(message({ id: "1", scope: "server", message: "maintenance soon" }));
    await flushPromises();
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]).toMatchObject({ title: "Server", description: "Ana: maintenance soon" });

    toasts.value[0].action?.onClick();
    expect(options.chatTab.value).toBe("server");
  });

  it("stays quiet for the open chat, your own messages and messages that were already there", async () => {
    const { options, chatMessages } = await mountUseChat();
    chatMessages.push(message({ id: "1", scope: "channel" }), message({ id: "2", scope: "server", isSelf: true }));
    await flushPromises();
    expect(toasts.value).toHaveLength(0);

    options.chatTab.value = "server";
    chatMessages.push(message({ id: "3", scope: "server" }));
    await flushPromises();
    expect(toasts.value).toHaveLength(0);
  });

  it("names a private chat after the person and shows only the text", async () => {
    const { chatMessages } = await mountUseChat();
    chatMessages.push(message({ id: "1", scope: "private", conversationId: "c1", message: "psst" }));
    await flushPromises();
    expect(toasts.value[0]).toMatchObject({ title: "Ana", description: "psst" });
  });

  it("raises one toast per chat in a burst", async () => {
    const { chatMessages } = await mountUseChat();
    chatMessages.push(message({ id: "1", scope: "server" }));
    await flushPromises();
    chatMessages.push(message({ id: "2", scope: "server" }));
    await flushPromises();
    expect(toasts.value).toHaveLength(1);

    vi.setSystemTime(Date.now() + 5000);
    chatMessages.push(message({ id: "3", scope: "server" }));
    await flushPromises();
    expect(toasts.value).toHaveLength(2);
  });

  it("stays quiet for a muted chat and remembers the mute", async () => {
    const first = await mountUseChat();
    first.options.chatTab.value = "server";
    await flushPromises();
    const muting = first.vm as unknown as Muting;
    muting.toggleActiveChatMute();
    expect(muting.activeChatMuted).toBe(true);
    first.options.chatTab.value = "channel";
    first.chatMessages.push(message({ id: "1", scope: "server" }));
    await flushPromises();
    expect(toasts.value).toHaveLength(0);

    const second = await mountUseChat();
    second.options.chatTab.value = "server";
    await flushPromises();
    expect((second.vm as unknown as Muting).activeChatMuted).toBe(true);
  });

  it("keeps the mutes of each server apart", async () => {
    const a = await mountUseChat({ serverKey: () => "a:9987" });
    (a.vm as unknown as Muting).toggleActiveChatMute();
    const b = await mountUseChat({ serverKey: () => "b:9987" });
    expect((b.vm as unknown as Muting).activeChatMuted).toBe(false);
    const again = await mountUseChat({ serverKey: () => "a:9987" });
    expect((again.vm as unknown as Muting).activeChatMuted).toBe(true);
  });

  it("mutes a channel by itself, not whichever channel you are in next", async () => {
    const { vm, options } = await mountUseChat();
    (vm as unknown as Muting).toggleActiveChatMute();
    expect((vm as unknown as Muting).activeChatMuted).toBe(true);
    options.currentChannel.value = { ...options.currentChannel.value!, id: "other" };
    await flushPromises();
    expect((vm as unknown as Muting).activeChatMuted).toBe(false);
  });
});
