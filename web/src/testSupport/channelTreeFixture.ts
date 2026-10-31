import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { vi } from "vitest";
import type { ChannelInfo, ChannelMember, VoiceState } from "@/features/session";
import type { Spacer } from "@/shared/lib/parseSpacer";

export type Exposed = {
  memberQuery: string;
  away: boolean;
  toggleAway: () => Promise<void>;
  channelTree: Array<ChannelInfo & { depth: number; members: ChannelMember[]; spacer?: Spacer }>;
  currentChannel: (ChannelInfo & { depth: number; members: ChannelMember[] }) | undefined;
  ownChannelId: string;
  currentChannelName: string;
  currentChannelDescription: string;
  currentMembers: ChannelMember[];
  roomMembers: ChannelMember[];
  memberChannels: Array<ChannelInfo & { depth: number; members: ChannelMember[]; spacer?: Spacer }>;
  filteredMemberChannels: Array<ChannelInfo & { depth: number; members: ChannelMember[]; spacer?: Spacer }>;
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
  memberMoveMenuOtherChannels: Array<ChannelInfo & { depth: number; members: ChannelMember[]; spacer?: Spacer }>;
};

/** A centered spacer channel, to push into the fixture's channel list. */
export const spacerChannel: ChannelInfo = { id: "sp", parentID: "0", name: "[cspacer]Games" };

export function member(id: number, nickname: string): ChannelMember {
  return { id, nickname };
}

export function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
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
    unattributedError: null,
    channelSwitchedChannelId: "",
    ...overrides,
  }) as VoiceState;
}

export async function mountUseChannelTree(overrides: Record<string, unknown> = {}) {
  const { useChannelTree } = await import("@/features/room/members/useChannelTree");
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
