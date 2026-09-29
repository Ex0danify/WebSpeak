import { computed, reactive, ref, watch, type Ref } from "vue";
import { useI18n } from "../i18n/use-i18n.js";
import { localizeMessage } from "../lib/messages.js";
import { toast as raiseToast } from "../lib/use-toast.js";
import type { ChannelInfo, ChannelMember, VoiceState } from "./useVoiceWebSocket.js";

export interface TreeChannel extends ChannelInfo {
  depth: number;
  members: ChannelMember[];
}

export interface UseChannelTreeOptions {
  voiceState: VoiceState;
  channels: ChannelInfo[];
  members: ChannelMember[];
  /** Owned by useJoinForm: the target channel name typed on the join screen, used as a fallback
   *  before the member list confirms which channel you actually landed in. */
  channel: Ref<string>;
  selectedChannelId: Ref<string>;
  /** Owned by WebClient.vue until the future useChat composable (Track 1.5) extracts it. */
  chatTab: Ref<"channel" | "server" | "private" | "events">;
  /** Owned by WebClient.vue until the future useMemberMenu composable (Track 1.4) extracts it. */
  memberMenu: Ref<{ member: ChannelMember; x: number; y: number } | null>;
  switchChannel: (channelId: string, password?: string) => void;
  moveClient: (clientId: number, channelId: string, password?: string) => Promise<void>;
  clearError: () => void;
  setAway: (away: boolean, message?: string) => void;
}

/** The channel tree, the current-channel/member derivations built on top of it, the member-panel
 *  search, the protected-channel password dialog, the away toggle, and the drag/drop (mouse and
 *  pointer) machinery for moving members between channels. */
export function useChannelTree(options: UseChannelTreeOptions) {
  const { voiceState, channels, members, channel, selectedChannelId, chatTab, memberMenu, switchChannel, moveClient, clearError, setAway } = options;
  const { language, t } = useI18n();

  function notify(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  function localizedMessage(message: string): string {
    return localizeMessage(message, language.value);
  }

  const memberQuery = ref("");
  const away = ref(false);
  const awayMessage = ref("");
  const channelPasswordDialog = reactive({ open: false, channelId: "", password: "", error: "", submitting: false });
  const draggedMember = ref<ChannelMember | null>(null);
  const dragOverChannelId = ref("");
  const memberPointerDrag = reactive({ member: null as ChannelMember | null, pointerId: null as number | null, startX: 0, startY: 0, active: false, targetChannelId: "" });

  const channelTree = computed<TreeChannel[]>(() => {
    const source = [...channels];
    const sourceIndex = new Map(source.map((item, index) => [item.id, index]));
    const enriched = source.map((item) => ({
      ...item,
      members: (item.members ?? []).map((member) => ({ ...member, isSelf: member.id === voiceState.tsClientId })),
    }));
    const byId = new Map(enriched.map((item) => [item.id, item]));
    const depthCache = new Map<string, number>();

    function depthOf(item: ChannelInfo, visiting = new Set<string>()): number {
      if (depthCache.has(item.id)) return depthCache.get(item.id)!;
      if (!item.parentID || item.parentID === "0" || visiting.has(item.id)) return 0;
      const parent = byId.get(item.parentID);
      const depth = parent ? depthOf(parent, new Set(visiting).add(item.id)) + 1 : 0;
      depthCache.set(item.id, depth);
      return depth;
    }

    const childrenByParent = new Map<string, TreeChannel[]>();
    for (const item of enriched) {
      const channel = { ...item, depth: depthOf(item) };
      const siblings = childrenByParent.get(channel.parentID) ?? [];
      siblings.push(channel);
      childrenByParent.set(channel.parentID, siblings);
    }

    function orderSiblings(siblings: TreeChannel[]): TreeChannel[] {
      const bySiblingId = new Map(siblings.map((item) => [item.id, item]));
      const successors = new Map<string, TreeChannel[]>();
      const roots: TreeChannel[] = [];
      const sourceOrder = (left: TreeChannel, right: TreeChannel) =>
        (sourceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER);

      for (const item of siblings) {
        const predecessor = item.order && item.order !== "0" && bySiblingId.has(item.order) ? item.order : "";
        if (!predecessor) roots.push(item);
        else successors.set(predecessor, [...(successors.get(predecessor) ?? []), item]);
      }

      roots.sort(sourceOrder);
      for (const items of successors.values()) items.sort(sourceOrder);

      const ordered: TreeChannel[] = [];
      const visited = new Set<string>();
      const append = (item: TreeChannel) => {
        if (visited.has(item.id)) return;
        visited.add(item.id);
        ordered.push(item);
        for (const successor of successors.get(item.id) ?? []) append(successor);
      };
      for (const root of roots) append(root);
      for (const item of [...siblings].sort(sourceOrder)) append(item);
      return ordered;
    }

    const orderedTree: TreeChannel[] = [];
    const visit = (parentID: string) => {
      for (const channel of orderSiblings(childrenByParent.get(parentID) ?? [])) {
        orderedTree.push(channel);
        visit(channel.id);
      }
    };
    visit("0");
    for (const channel of enriched) {
      if (!orderedTree.some((item) => item.id === channel.id)) {
        const fallback = { ...channel, depth: depthOf(channel) };
        orderedTree.push(fallback);
        visit(channel.id);
      }
    }
    return orderedTree;
  });

  const currentChannel = computed<TreeChannel | undefined>(() => {
    const explicitlySelected = channelTree.value.find((item) => item.id === selectedChannelId.value);
    if (explicitlySelected) return explicitlySelected;
    const fromSelf = channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId));
    if (fromSelf) return fromSelf;
    return channelTree.value.find((item) => item.name === channel.value) ?? channelTree.value[0];
  });
  /** The channel the member list says you are in right now, whoever moved you there (F22). */
  const ownChannelId = computed(() => channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId))?.id ?? "");
  const currentChannelName = computed(() => (currentChannel.value?.name ?? channel.value) || t("voiceLobby"));
  const currentChannelDescription = computed(() => currentChannel.value?.description ?? "");
  const currentMembers = computed<ChannelMember[]>(() => {
    const source = currentChannel.value ? currentChannel.value.members : members;
    return source.map((member) => ({ ...member, isSelf: member.isSelf || member.id === voiceState.tsClientId }));
  });
  const roomMembers = computed(() => currentMembers.value.slice(0, 4));
  const memberChannels = computed<TreeChannel[]>(() => {
    if (channelTree.value.length) return channelTree.value;
    return [{ id: "__current__", parentID: "0", name: currentChannelName.value, description: currentChannelDescription.value, members: currentMembers.value, depth: 0 }];
  });
  const filteredMemberChannels = computed(() => {
    const search = memberQuery.value.trim().toLowerCase();
    if (!search) return memberChannels.value;
    return memberChannels.value.filter((item) => item.name.toLowerCase().includes(search) || item.members.some((member) => member.nickname.toLowerCase().includes(search)));
  });
  const memberMoveMenuCurrentChannel = computed<TreeChannel | null>(() => {
    const member = memberMenu.value?.member;
    const currentId = currentChannel.value?.id;
    if (!member || !currentId || currentId === "__current__") return null;
    return memberChannels.value.find((channel) => channel.id === currentId) ?? null;
  });
  const memberMoveMenuCurrentSameChannel = computed(() => {
    const member = memberMenu.value?.member;
    const currentId = memberMoveMenuCurrentChannel.value?.id;
    if (!member || !currentId) return false;
    return memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id))?.id === currentId;
  });
  const memberMoveMenuOtherChannels = computed<TreeChannel[]>(() => {
    const member = memberMenu.value?.member;
    if (!member) return [];
    const sourceChannelId = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id))?.id ?? "";
    const currentChannelId = memberMoveMenuCurrentChannel.value?.id;
    return memberChannels.value.filter((channel) => channel.id !== "__current__" && channel.id !== sourceChannelId && channel.id !== currentChannelId);
  });

  watch(channelTree, (list) => {
    if (!selectedChannelId.value && list[0]) {
      selectedChannelId.value = list.find((item) => item.name === channel.value)?.id
        ?? list.find((item) => item.members.some((member) => member.id === voiceState.tsClientId))?.id
        ?? "";
    }
  }, { deep: true });
  // F22: a move made by someone else changes the member list, not selectedChannelId, so the
  // highlight, the voice cards and the channel chat stayed on the channel you used to be in. Follow
  // the member list instead: once your own channel is known, keep selectedChannelId matched to it.
  // The very first assignment is left to the watcher above, which also honours the channel you typed.
  watch(ownChannelId, (id, previous) => {
    if (id && previous) selectedChannelId.value = id;
  });
  watch(() => voiceState.errorCode, (code) => {
    if (code !== "CHANNEL_PASSWORD_REQUIRED" || !selectedChannelId.value) return;
    channelPasswordDialog.open = true;
    channelPasswordDialog.channelId = selectedChannelId.value;
    channelPasswordDialog.password = "";
    channelPasswordDialog.error = t("channelPasswordRetry");
    channelPasswordDialog.submitting = false;
    clearError();
  });
  watch(() => voiceState.channelSwitchedChannelId, (channelId) => {
    if (!channelPasswordDialog.open || !channelId || channelId !== channelPasswordDialog.channelId) return;
    channelPasswordDialog.open = false;
    channelPasswordDialog.channelId = "";
    channelPasswordDialog.password = "";
    channelPasswordDialog.error = "";
    channelPasswordDialog.submitting = false;
  });

  function selectChannel(item: TreeChannel) {
    selectedChannelId.value = item.id;
    channel.value = item.name;
    chatTab.value = "channel";
    switchChannel(item.id);
  }

  function submitChannelPassword() {
    if (!channelPasswordDialog.open || !channelPasswordDialog.channelId || !channelPasswordDialog.password) return;
    channelPasswordDialog.error = "";
    channelPasswordDialog.submitting = true;
    switchChannel(channelPasswordDialog.channelId, channelPasswordDialog.password);
  }

  function cancelChannelPassword() {
    const ownChannel = channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId));
    if (ownChannel) selectedChannelId.value = ownChannel.id;
    channelPasswordDialog.open = false;
    channelPasswordDialog.channelId = "";
    channelPasswordDialog.password = "";
    channelPasswordDialog.error = "";
    channelPasswordDialog.submitting = false;
    clearError();
  }

  function selectChannelById() {
    const item = channelTree.value.find((candidate) => candidate.id === selectedChannelId.value);
    if (item) selectChannel(item);
  }

  function channelLabel(item: TreeChannel) {
    return `${"　".repeat(item.depth)}${item.name}`;
  }

  function toggleAway(): void {
    away.value = !away.value;
    awayMessage.value = away.value ? (window.prompt(t("awayPrompt"), awayMessage.value) ?? "") : "";
    setAway(away.value, awayMessage.value);
  }

  async function moveMemberDirect(member: ChannelMember, targetChannelId: string): Promise<void> {
    if (member.isSelf || !targetChannelId || targetChannelId === "__current__") return;
    const sourceChannel = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id));
    if (sourceChannel?.id === targetChannelId) {
      memberMenu.value = null;
      return;
    }
    memberMenu.value = null;
    try {
      // Moving a visible client is a server-admin operation; channel passwords
      // must never be requested or forwarded for this action.
      await moveClient(member.id, targetChannelId);
      notify(t("moveMemberSuccess"));
    } catch (error: unknown) {
      notify(localizedMessage(error instanceof Error ? error.message : "操作失败"), "danger");
    }
  }

  function onMemberDragStart(member: ChannelMember, event: DragEvent): void {
    if (member.isSelf) {
      event.preventDefault();
      return;
    }
    draggedMember.value = member;
    dragOverChannelId.value = "";
    event.dataTransfer?.setData("text/plain", String(member.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function onMemberDragEnd(): void {
    draggedMember.value = null;
    dragOverChannelId.value = "";
  }

  function onMemberPointerDown(member: ChannelMember, event: PointerEvent): void {
    if (member.isSelf || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input,button")) return;
    event.preventDefault();
    memberPointerDrag.member = member;
    memberPointerDrag.pointerId = event.pointerId;
    memberPointerDrag.startX = event.clientX;
    memberPointerDrag.startY = event.clientY;
    memberPointerDrag.active = false;
    memberPointerDrag.targetChannelId = "";
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function onMemberPointerMove(event: PointerEvent): void {
    if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - memberPointerDrag.startX, event.clientY - memberPointerDrag.startY);
    if (!memberPointerDrag.active && distance < 6) return;
    event.preventDefault();
    memberPointerDrag.active = true;
    draggedMember.value = memberPointerDrag.member;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-channel-id]");
    const targetChannelId = target?.dataset.memberChannelId ?? "";
    const sourceChannel = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === memberPointerDrag.member?.id));
    if (!sourceChannel || !targetChannelId || targetChannelId === sourceChannel.id) {
      memberPointerDrag.targetChannelId = "";
      dragOverChannelId.value = "";
      return;
    }
    memberPointerDrag.targetChannelId = targetChannelId;
    dragOverChannelId.value = targetChannelId;
  }

  function onMemberPointerUp(event: PointerEvent): void {
    if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
    const member = memberPointerDrag.member;
    const targetChannelId = memberPointerDrag.targetChannelId;
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.releasePointerCapture?.(event.pointerId);
    memberPointerDrag.member = null;
    memberPointerDrag.pointerId = null;
    memberPointerDrag.active = false;
    memberPointerDrag.targetChannelId = "";
    draggedMember.value = null;
    dragOverChannelId.value = "";
    if (targetChannelId) void moveMemberDirect(member, targetChannelId);
  }

  function onMemberPointerCancel(event: PointerEvent): void {
    if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.releasePointerCapture?.(event.pointerId);
    memberPointerDrag.member = null;
    memberPointerDrag.pointerId = null;
    memberPointerDrag.active = false;
    memberPointerDrag.targetChannelId = "";
    draggedMember.value = null;
    dragOverChannelId.value = "";
  }

  function onChannelDragOver(channelItem: TreeChannel, event: DragEvent): void {
    const member = draggedMember.value;
    if (!member || channelItem.id === "__current__") return;
    const sourceChannel = memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id));
    if (!sourceChannel || sourceChannel.id === channelItem.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dragOverChannelId.value = channelItem.id;
  }

  function onChannelDragLeave(channelItem: TreeChannel, event: DragEvent): void {
    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return;
    if (dragOverChannelId.value === channelItem.id) dragOverChannelId.value = "";
  }

  function onChannelDrop(channelItem: TreeChannel, event: DragEvent): void {
    event.preventDefault();
    const member = draggedMember.value;
    onMemberDragEnd();
    if (!member || channelItem.id === "__current__") return;
    void moveMemberDirect(member, channelItem.id);
  }

  return {
    memberQuery,
    away,
    toggleAway,
    channelTree,
    currentChannel,
    ownChannelId,
    currentChannelName,
    currentChannelDescription,
    currentMembers,
    roomMembers,
    memberChannels,
    filteredMemberChannels,
    selectChannel,
    selectChannelById,
    channelLabel,
    channelPasswordDialog,
    submitChannelPassword,
    cancelChannelPassword,
    draggedMember,
    dragOverChannelId,
    onMemberDragStart,
    onMemberDragEnd,
    onMemberPointerDown,
    onMemberPointerMove,
    onMemberPointerUp,
    onMemberPointerCancel,
    onChannelDragOver,
    onChannelDragLeave,
    onChannelDrop,
    moveMemberDirect,
    memberMoveMenuCurrentChannel,
    memberMoveMenuCurrentSameChannel,
    memberMoveMenuOtherChannels,
  };
}
