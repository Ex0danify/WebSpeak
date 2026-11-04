import { describe, expect, it, vi } from "vitest";
import { useGateway } from "../../../../test/support/gateway.js";
import { joinVoice } from "../../../../test/support/voice.js";
import type { JsonMessage } from "../../../../test/support/wsClient.js";

const gateways = useGateway();

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("pixels")]);
const GROUPS = [
  { id: 7, name: "Normal", isDefault: false, type: 1, sortId: 0, iconId: 600 },
  { id: 3, name: "Server Admin", isDefault: false, type: 0, sortId: 1, iconId: 300 },
  { id: 8, name: "Guest", isDefault: true, type: 1, sortId: 2, iconId: 0 },
];

type Member = { id: number; serverGroups?: number[]; channelGroupId?: number };
const roomMembers = (message: JsonMessage) =>
  (message.channels as { name: string; members: Member[] }[]).find((channel) => channel.name === "Room A")!.members;

describe("server groups", () => {
  it("sends the group list after the welcome and the group ids of every member", async () => {
    const gateway = await gateways.start();
    gateway.ts.groups.server = GROUPS;
    const bob = gateway.ts.addMember("bob", 2n);
    gateway.ts.members.get(bob.id)!.serverGroups = ["7", "8"];
    gateway.ts.addMember("carol", 2n);
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    expect(socket.messagesOfType("serverGroups")).toEqual([
      {
        type: "serverGroups",
        groups: [
          { id: 7, name: "Normal", iconId: 600, isDefault: false },
          { id: 3, name: "Server Admin", iconId: 300, isDefault: false },
          { id: 8, name: "Guest", iconId: 0, isDefault: true },
        ],
      },
    ]);
    const members = roomMembers(socket.messagesOfType("channelList").at(-1)!);
    expect(members.find((member) => member.id === bob.id)?.serverGroups).toEqual([7, 8]);
    expect(members.filter((member) => "serverGroups" in member)).toHaveLength(1);
  });

  it("sends the channel group list and each member's channel group, and follows a change", async () => {
    const gateway = await gateways.start();
    gateway.ts.groups.channel = [
      { id: 5, name: "Channel Admin", isDefault: false, type: 1, sortId: 0, iconId: 100 },
      { id: 8, name: "Guest", isDefault: true, type: 1, sortId: 1, iconId: 0 },
    ];
    const bob = gateway.ts.addMember("bob", 2n);
    gateway.ts.updateMember(bob.id, { channelGroupId: 5 });
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    expect(socket.messagesOfType("channelGroups")).toEqual([
      {
        type: "channelGroups",
        groups: [
          { id: 5, name: "Channel Admin", iconId: 100, isDefault: false },
          { id: 8, name: "Guest", iconId: 0, isDefault: true },
        ],
      },
    ]);
    const bobIn = (message: JsonMessage) => roomMembers(message).find((member) => member.id === bob.id);
    expect(bobIn(socket.messagesOfType("channelList").at(-1)!)).toMatchObject({ channelGroupId: 5 });
    const after = socket.mark();
    gateway.ts.updateMember(bob.id, { channelGroupId: 8 });
    const list = await socket.waitForMessage((message) => message.type === "channelList" && bobIn(message)?.channelGroupId === 8, {
      after,
    });
    expect(bobIn(list)).toMatchObject({ channelGroupId: 8 });
  });

  it("downloads each icon file once, skips built-in and missing ones, and sends it as a data URL", async () => {
    const gateway = await gateways.start();
    gateway.ts.groups.server = [
      ...GROUPS,
      { id: 4, name: "Normal", isDefault: false, type: 0, sortId: 3, iconId: 5000 },
      { id: 5, name: "Guest", isDefault: false, type: 0, sortId: 4, iconId: 6000 },
      { id: 2, name: "Admin Server Query", isDefault: false, type: 2, sortId: 5, iconId: 5000 },
    ];
    gateway.ts.groups.icons.set(5000, PNG);
    const step = vi.spyOn(gateway.ts, "step");
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    await socket.waitForMessage("serverGroupIcon");
    await vi.waitFor(() => expect(step.mock.calls.filter(([operation]) => operation === "groupIcon")).toHaveLength(4));
    expect(socket.messagesOfType("serverGroupIcon")).toEqual([
      { type: "serverGroupIcon", iconId: 5000, icon: `data:image/png;base64,${PNG.toString("base64")}` },
    ]);
  });

  it("sends the list again when the server edits it, and only then", async () => {
    const gateway = await gateways.start();
    gateway.ts.groups.server = GROUPS;
    const session = await joinVoice(gateway, { nickname: "alice" });
    session.client.emit("groupsChanged");
    gateway.ts.groups.server = GROUPS.map((group) => (group.id === 8 ? { ...group, name: "Visitor" } : group));
    session.client.emit("groupsChanged");
    await session.socket.waitForMessage(
      (message) => message.type === "serverGroups" && (message.groups as { name: string }[]).some((group) => group.name === "Visitor"),
    );
    expect(session.socket.messagesOfType("serverGroups")).toHaveLength(2);
  });

  it("keeps joining when an icon cannot be downloaded", async () => {
    const gateway = await gateways.start();
    gateway.ts.groups.server = GROUPS;
    gateway.ts.failNext("groupIcon", new Error("no file transfer"));
    const { socket } = await joinVoice(gateway, { nickname: "alice" });
    await socket.waitForMessage("serverGroups");
    expect(socket.messagesOfType("serverGroupIcon")).toEqual([]);
  });
});
