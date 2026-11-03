import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@/features/session";
import type { Notice } from "@/features/room/chat/groupMessages";
import { mountUseChat } from "@/testSupport/chatFixture";

type Exposed = { channelNotices: Notice[]; eventText: (event: ServerEvent) => string };

// The fixture's open channel is "lobby".
const event = (id: string, kind: ServerEvent["kind"], extra: Partial<ServerEvent> = {}): ServerEvent => ({
  id,
  kind,
  message: id,
  timestamp: Number(id.replace(/\D/g, "")) || 1,
  ...extra,
});

async function noticesFor(events: ServerEvent[], tab: "channel" | "server" = "channel") {
  const { vm, options, serverEvents } = await mountUseChat();
  options.chatTab.value = tab;
  serverEvents.push(...events);
  await flushPromises();
  return (vm as unknown as Exposed).channelNotices;
}

describe("channel notices", () => {
  it("shows who joined or left the open channel, with the sentence of the log", async () => {
    const notices = await noticesFor([
      event("e1", "joined", { nickname: "Ana", channelId: "lobby" }),
      event("e2", "left", { nickname: "Ben", channelId: "lobby" }),
    ]);
    expect(notices.map((notice) => notice.text)).toEqual(["Ana joined the server", "Ben left the server"]);
    expect(notices.map((notice) => notice.name)).toEqual(["Ana", "Ben"]);
  });

  it("leaves out what happened in other channels", async () => {
    const notices = await noticesFor([event("e1", "joined", { nickname: "Ana", channelId: "other" })]);
    expect(notices).toEqual([]);
  });

  it("tells a move into the channel from a move out of it", async () => {
    const notices = await noticesFor([
      event("e1", "moved", { nickname: "Ana", channelId: "lobby", fromChannelId: "other" }),
      event("e2", "moved", { nickname: "Ben", channelId: "other", fromChannelId: "lobby", channelName: "Room B" }),
      event("e3", "moved", { nickname: "Cy", channelId: "x", fromChannelId: "y" }),
    ]);
    expect(notices.map((notice) => notice.text)).toEqual(["Ana joined this channel", "Ben moved to Room B"]);
  });

  it("keeps everything before your last move or connect out of the conversation", async () => {
    const notices = await noticesFor([
      event("e1", "connection"),
      event("e2", "joined", { nickname: "Early", channelId: "lobby" }),
      event("e3", "selfMoved", { channelId: "lobby", channelName: "Lobby" }),
      event("e4", "joined", { nickname: "Late", channelId: "lobby" }),
    ]);
    expect(notices.map((notice) => notice.text)).toEqual(["You moved to Lobby", "Late joined the server"]);
  });

  it("skips what the log keeps to itself", async () => {
    const notices = await noticesFor([
      event("e1", "renamed", { nickname: "Ana", previousNickname: "Bob", channelId: "lobby" }),
      event("e2", "poke", { nickname: "Ana" }),
      event("e3", "channelCreated", { channelName: "New" }),
    ]);
    expect(notices).toEqual([]);
  });

  it("shows none on the server or a private tab", async () => {
    const notices = await noticesFor([event("e1", "joined", { nickname: "Ana", channelId: "lobby" })], "server");
    expect(notices).toEqual([]);
  });

  it("names your own move to a channel without a name", async () => {
    const { vm, serverEvents } = await mountUseChat();
    serverEvents.push(event("e1", "selfMoved", { channelId: "lobby" }));
    await flushPromises();
    expect((vm as unknown as Exposed).eventText(serverEvents[0]!)).toBe("You moved to Unnamed channel");
  });
});
