import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import { useRoomSounds } from "@/features/room/shell/useRoomSounds";
import { dismissToast, toast, useToast } from "@/shared/composables/useToast";
import type { ChannelGroup, ChannelInfo, RoomNotice, ServerGroup } from "@/features/session";

afterEach(() => dismissToast());

function setup(channels: ChannelInfo[], groups: { server?: ServerGroup[]; channel?: ChannelGroup[] } = {}) {
  const playNotification = vi.fn();
  const voiceState = reactive({ connected: true, reconnecting: false, reconnectFailed: false, tsClientId: 1 });
  const reactiveChannels = reactive(channels);
  const roomNotices = reactive<RoomNotice[]>([]);
  const serverGroups = ref(groups.server ?? []);
  const channelGroups = ref(groups.channel ?? []);
  useRoomSounds({
    voiceState,
    channels: reactiveChannels,
    roomNotices,
    chatMessages: reactive([]),
    pokeNotifications: reactive([]),
    serverGroups,
    channelGroups,
    playNotification,
  });
  return { playNotification, channels: reactiveChannels, roomNotices, serverGroups, channelGroups };
}

const member = (id: number) => ({ id, nickname: `user${id}` });
const channel = (id: string, ids: number[]): ChannelInfo => ({ id, parentID: "0", name: id, members: ids.map(member) });

describe("roster sounds", () => {
  it("plays nothing while your channel first appears", async () => {
    const { playNotification, channels } = setup([channel("a", [])]);
    channels[0]!.members = [member(1), member(2)];
    await nextTick();
    expect(playNotification).not.toHaveBeenCalled();
  });

  it("plays join and leave for other members of your channel", async () => {
    const { playNotification, channels } = setup([channel("a", [1]), channel("b", [3])]);
    channels[0]!.members!.push(member(2));
    await nextTick();
    expect(playNotification).toHaveBeenLastCalledWith("userJoined");
    channels[0]!.members!.pop();
    await nextTick();
    expect(playNotification).toHaveBeenLastCalledWith("userLeft");
  });

  it("stays quiet about members of other channels", async () => {
    const { playNotification, channels } = setup([channel("a", [1]), channel("b", [3])]);
    channels[1]!.members!.push(member(4));
    await nextTick();
    expect(playNotification).not.toHaveBeenCalled();
  });

  it("plays one switch cue when you change channel, not a join per member", async () => {
    const { playNotification, channels } = setup([channel("a", [1]), channel("b", [3, 4])]);
    channels[0]!.members!.pop();
    channels[1]!.members!.push(member(1));
    await nextTick();
    expect(playNotification).toHaveBeenCalledTimes(1);
    expect(playNotification).toHaveBeenCalledWith("channelSwitched");
  });
});

describe("error sounds", () => {
  it("plays for a danger toast, not for success, info or warning", async () => {
    const { playNotification } = setup([]);
    toast({ title: "done", variant: "success" });
    await nextTick();
    toast({ title: "fyi", variant: "info" });
    await nextTick();
    toast({ title: "careful", variant: "warning" });
    await nextTick();
    expect(playNotification).not.toHaveBeenCalled();
    toast({ title: "no join power", variant: "danger" });
    await nextTick();
    expect(playNotification).toHaveBeenCalledOnce();
    expect(playNotification).toHaveBeenCalledWith("error");
    dismissToast();
  });

  it("plays when a danger banner appears, not for an update of one already shown", async () => {
    const { playNotification, roomNotices } = setup([]);
    roomNotices.push({ code: "X", text: "x", title: "x", variant: "warning" });
    await nextTick();
    expect(playNotification).not.toHaveBeenCalled();
    roomNotices.push({ code: "VOICE_FAILED", text: "x", title: "x", variant: "danger" });
    await nextTick();
    expect(playNotification).toHaveBeenCalledWith("error");
    roomNotices.push({ code: "OTHER", text: "x", title: "x", variant: "info" });
    await nextTick();
    expect(playNotification).toHaveBeenCalledOnce();
  });
});

describe("group sounds", () => {
  const own = (serverGroups: number[], channelGroupId = 0) => ({ id: 1, nickname: "me", serverGroups, channelGroupId });
  const setupGroups = (channelId = "a") => {
    const started = setup([{ ...channel(channelId, []), members: [own([8], 8)] }, channel("b", [3])], {
      server: [
        { id: 6, name: "Server Admin", iconId: 0, isDefault: false },
        { id: 8, name: "Guest", iconId: 0, isDefault: true },
      ],
      channel: [
        { id: 6, name: "Operator", iconId: 0, isDefault: false },
        { id: 8, name: "Guest", iconId: 0, isDefault: true },
      ],
    });
    return { ...started, me: () => started.channels[0]!.members![0]! };
  };
  const lastToast = () => useToast().toasts.value.at(-1);

  it("plays the assigned cue with a success toast when you are given a server group", async () => {
    const { playNotification, me } = setupGroups();
    me().serverGroups = [8, 6];
    await nextTick();
    expect(playNotification).toHaveBeenCalledOnce();
    expect(playNotification).toHaveBeenCalledWith("groupAssigned");
    expect(lastToast()).toMatchObject({ variant: "success", title: "Server group assigned: Server Admin" });
  });

  it("plays the revoked cue with a warning toast when you lose one, and the default group coming back stays unnoticed", async () => {
    const { playNotification, me } = setupGroups();
    me().serverGroups = [6];
    await nextTick();
    playNotification.mockClear();
    me().serverGroups = [8];
    await nextTick();
    expect(playNotification).toHaveBeenCalledOnce();
    expect(playNotification).toHaveBeenCalledWith("groupRevoked");
    expect(lastToast()).toMatchObject({ variant: "warning", title: "Server group revoked: Server Admin" });
  });

  it("treats a channel group like a server group, and falling back to the default as a revoke", async () => {
    const { playNotification, me } = setupGroups();
    me().channelGroupId = 6;
    await nextTick();
    expect(playNotification).toHaveBeenLastCalledWith("groupAssigned");
    expect(lastToast()).toMatchObject({ variant: "success", title: "Channel group assigned: Operator" });
    me().channelGroupId = 8;
    await nextTick();
    expect(playNotification).toHaveBeenLastCalledWith("groupRevoked");
    expect(lastToast()).toMatchObject({ variant: "warning", title: "Channel group revoked: Operator" });
  });

  it("plays one cue for several changes at once, assigned winning, and a toast for each", async () => {
    const { playNotification, me } = setupGroups();
    me().serverGroups = [6];
    await nextTick();
    playNotification.mockClear();
    useToast().dismiss();
    me().serverGroups = [];
    me().channelGroupId = 6;
    await nextTick();
    expect(playNotification).toHaveBeenCalledOnce();
    expect(playNotification).toHaveBeenCalledWith("groupAssigned");
    expect(useToast().toasts.value.map((item) => item.title)).toEqual([
      "Server group revoked: Server Admin",
      "Channel group assigned: Operator",
    ]);
  });

  it("stays quiet about the groups of others", async () => {
    const { playNotification, channels } = setupGroups();
    channels[1]!.members![0] = { id: 3, nickname: "other", serverGroups: [6], channelGroupId: 6 } as never;
    await nextTick();
    expect(playNotification).not.toHaveBeenCalled();
    expect(lastToast()).toBeUndefined();
  });

  it("plays only the switch cue when a move brings another channel group", async () => {
    const { playNotification, channels, me } = setupGroups();
    const moved = { ...me(), channelGroupId: 6 };
    channels[0]!.members!.pop();
    channels[1]!.members!.push(moved);
    await nextTick();
    expect(playNotification).toHaveBeenCalledOnce();
    expect(playNotification).toHaveBeenCalledWith("channelSwitched");
    expect(lastToast()).toBeUndefined();
  });

  it("stays quiet about a group the list does not know yet", async () => {
    const { playNotification, me, serverGroups, channelGroups } = setupGroups();
    serverGroups.value = [];
    channelGroups.value = [];
    me().serverGroups = [8, 6];
    me().channelGroupId = 6;
    await nextTick();
    expect(playNotification).not.toHaveBeenCalled();
    expect(lastToast()).toBeUndefined();
  });

  it("stays quiet while the first channel group of your session arrives", async () => {
    const { playNotification, me } = setupGroups();
    me().channelGroupId = 0;
    await nextTick();
    me().channelGroupId = 6;
    await nextTick();
    expect(playNotification).not.toHaveBeenCalled();
  });
});
