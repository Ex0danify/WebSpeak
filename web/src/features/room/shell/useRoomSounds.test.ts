import { describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { useRoomSounds } from "@/features/room/shell/useRoomSounds";
import { dismissToast, toast } from "@/shared/composables/useToast";
import type { ChannelInfo, RoomNotice } from "@/features/session";

function setup(channels: ChannelInfo[]) {
  const playNotification = vi.fn();
  const voiceState = reactive({ connected: true, reconnecting: false, reconnectFailed: false, tsClientId: 1 });
  const reactiveChannels = reactive(channels);
  const roomNotices = reactive<RoomNotice[]>([]);
  useRoomSounds({
    voiceState,
    channels: reactiveChannels,
    roomNotices,
    chatMessages: reactive([]),
    pokeNotifications: reactive([]),
    playNotification,
  });
  return { playNotification, channels: reactiveChannels, roomNotices };
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
