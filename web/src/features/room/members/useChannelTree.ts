import { computed, onScopeDispose, reactive, ref, watch, type Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { errorText, resolveText, text } from "@/shared/i18n/localizedText.js";
import { toast as raiseToast } from "@/shared/composables/useToast.js";
import { channelNameText, type ChannelMember } from "@/features/session";
import type { RoomSession, TreeChannel } from "../roomTypes.js";
import { buildChannelTree } from "./buildChannelTree.js";

/** How long the view waits for the member list to show you in the new channel after the gateway confirmed the join. */
const MEMBER_LIST_GRACE_MS = 1500;

export interface UseChannelTreeOptions {
  session: Pick<RoomSession["session"], "state" | "clearError">;
  roster: Pick<RoomSession["roster"], "channels" | "members">;
  actions: Pick<RoomSession["actions"], "switchChannel" | "moveClient" | "setAway">;
  /** Owned by useJoinForm, the target channel name typed on the join screen. It is the fallback
   *  before the member list confirms which channel you actually landed in. */
  channel: Ref<string>;
  selectedChannelId: Ref<string>;
  /** Owned by RoomView (also read by useChat). */
  chatTab: Ref<"channel" | "server" | "private" | "events">;
  /** Owned by useMemberMenu. */
  memberMenu: Ref<{ member: ChannelMember; x: number; y: number } | null>;
}

/** The channel tree and the current-channel/member derivations on top of it, the member-panel search, the protected-channel
 *  password dialog, the away toggle and the drag/drop machinery for moving members between channels. */
export function useChannelTree(options: UseChannelTreeOptions) {
  const { channel, selectedChannelId, chatTab, memberMenu } = options;
  const { state: voiceState, clearError } = options.session;
  const { channels, members } = options.roster;
  const { switchChannel, moveClient, setAway } = options.actions;
  const { t } = useI18n();

  function notify(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  const memberQuery = ref("");
  const away = ref(false);
  const awayMessage = ref("");
  const channelPasswordDialog = reactive({ open: false, channelId: "", password: "", error: "", submitting: false });
  const draggedMember = ref<ChannelMember | null>(null);
  const dragOverChannelId = ref("");
  const memberPointerDrag = reactive({
    member: null as ChannelMember | null,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    active: false,
    targetChannelId: "",
  });

  const channelTree = computed<TreeChannel[]>(() => buildChannelTree(channels, voiceState.tsClientId));

  const currentChannel = computed<TreeChannel | undefined>(() => {
    const explicitlySelected = channelTree.value.find((item) => item.id === selectedChannelId.value);
    if (explicitlySelected) return explicitlySelected;
    const fromSelf = channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId));
    if (fromSelf) return fromSelf;
    return channelTree.value.find((item) => item.name === channel.value) ?? channelTree.value[0];
  });
  /** The channel the member list says you are in right now, whoever moved you there. */
  const ownChannelId = computed(
    () => channelTree.value.find((item) => item.members.some((member) => member.id === voiceState.tsClientId))?.id ?? "",
  );
  const currentChannelName = computed(() => (currentChannel.value?.name ?? channel.value) || t("voiceLobby"));
  const currentChannelDescription = computed(() => currentChannel.value?.description ?? "");
  const currentMembers = computed<ChannelMember[]>(() => {
    const source = currentChannel.value ? currentChannel.value.members : members;
    return source.map((member) => ({ ...member, isSelf: member.isSelf || member.id === voiceState.tsClientId }));
  });
  const roomMembers = computed(() => currentMembers.value.slice(0, 4));
  const memberChannels = computed<TreeChannel[]>(() => {
    if (channelTree.value.length) return channelTree.value;
    return [
      {
        id: "__current__",
        parentID: "0",
        name: currentChannelName.value,
        description: currentChannelDescription.value,
        members: currentMembers.value,
        depth: 0,
      },
    ];
  });
  const filteredMemberChannels = computed(() => {
    const search = memberQuery.value.trim().toLowerCase();
    if (!search) return memberChannels.value;
    return memberChannels.value.filter(
      (item) => item.name.toLowerCase().includes(search) || item.members.some((member) => member.nickname.toLowerCase().includes(search)),
    );
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
    const sourceChannelId =
      memberChannels.value.find((channel) => channel.members.some((candidate) => candidate.id === member.id))?.id ?? "";
    const currentChannelId = memberMoveMenuCurrentChannel.value?.id;
    return memberChannels.value.filter(
      (channel) => channel.id !== "__current__" && channel.id !== sourceChannelId && channel.id !== currentChannelId,
    );
  });

  watch(channelTree, (list) => {
    if (!selectedChannelId.value && list[0]) {
      selectedChannelId.value =
        list.find((item) => item.name === channel.value)?.id ??
        list.find((item) => item.members.some((member) => member.id === voiceState.tsClientId))?.id ??
        "";
    }
  });
  // The channel picked last, until the gateway answers it. The view only follows once the join succeeded, so a refused
  // channel (no permission, full, password) is never shown, not even for a moment.
  let requested: { id: string; name: string } | null = null;
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  function commitRequested(): void {
    clearTimeout(commitTimer);
    if (!requested) return;
    selectedChannelId.value = requested.id;
    channel.value = requested.name;
    chatTab.value = "channel";
    requested = null;
  }
  onScopeDispose(() => clearTimeout(commitTimer));
  // A move made by someone else changes the member list, not selectedChannelId, so keep selectedChannelId matched to your own
  // channel once it is known. The very first assignment is left to the watcher above, which also honours the typed channel.
  // The member list is what places you in the channel, so the view follows it in the same render. Following the gateway's
  // confirmation alone would show the new channel for a frame without you in it.
  watch(ownChannelId, (id, previous) => {
    if (requested && id === requested.id) commitRequested();
    else if (id && previous) selectedChannelId.value = id;
  });
  watch(
    () => voiceState.errorCode,
    (code) => {
      if (code && code !== "CHANNEL_PASSWORD_REQUIRED" && requested) {
        clearTimeout(commitTimer);
        requested = null;
        // The refusal (no permission, channel full, ...) is otherwise only kept in the session state, which nothing shows here.
        notify(resolveText(voiceState.error), "danger");
        clearError();
        return;
      }
      if (code !== "CHANNEL_PASSWORD_REQUIRED" || !requested) return;
      channelPasswordDialog.open = true;
      channelPasswordDialog.channelId = requested.id;
      channelPasswordDialog.password = "";
      channelPasswordDialog.error = t("channelPasswordRetry");
      channelPasswordDialog.submitting = false;
      clearError();
    },
  );
  watch(
    () => voiceState.channelSwitchedChannelId,
    (channelId) => {
      if (channelId && requested?.id === channelId) {
        // Already in that channel (nothing will move) or the member list is ahead: show it now. Otherwise the member list
        // follows within moments and commits, the timer only covers one that never arrives.
        if (ownChannelId.value === channelId) commitRequested();
        else {
          clearTimeout(commitTimer);
          commitTimer = setTimeout(commitRequested, MEMBER_LIST_GRACE_MS);
        }
      }
      if (!channelPasswordDialog.open || !channelId || channelId !== channelPasswordDialog.channelId) return;
      channelPasswordDialog.open = false;
      channelPasswordDialog.channelId = "";
      channelPasswordDialog.password = "";
      channelPasswordDialog.error = "";
      channelPasswordDialog.submitting = false;
    },
  );

  function selectChannel(item: TreeChannel) {
    clearTimeout(commitTimer);
    requested = { id: item.id, name: item.name };
    switchChannel(item.id);
  }

  function submitChannelPassword() {
    if (!channelPasswordDialog.open || !channelPasswordDialog.channelId || !channelPasswordDialog.password) return;
    channelPasswordDialog.error = "";
    channelPasswordDialog.submitting = true;
    switchChannel(channelPasswordDialog.channelId, channelPasswordDialog.password);
  }

  function cancelChannelPassword() {
    clearTimeout(commitTimer);
    requested = null;
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
    return `${"\u3000".repeat(item.depth)}${channelNameText(item, t)}`;
  }

  async function toggleAway(): Promise<void> {
    const previous = { away: away.value, message: awayMessage.value };
    away.value = !away.value;
    awayMessage.value = away.value ? (window.prompt(t("awayPrompt"), awayMessage.value) ?? "") : "";
    try {
      await setAway(away.value, awayMessage.value);
    } catch (error: unknown) {
      // The server kept the old state, so the button goes back to it.
      away.value = previous.away;
      awayMessage.value = previous.message;
      notify(resolveText(errorText(error, text("err_OPERATION_FAILED"))), "danger");
    }
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
      // Moving a visible client is a server-admin operation, so channel passwords are never requested or forwarded here.
      await moveClient(member.id, targetChannelId);
      notify(t("moveMemberSuccess"));
    } catch (error: unknown) {
      notify(resolveText(errorText(error, text("err_OPERATION_FAILED"))), "danger");
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
    // The volume slider is not an input, but a press on it is a volume change and never the start of a move.
    if (target?.closest("input,button,[role=slider],.member-volume")) return;
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
    const sourceChannel = memberChannels.value.find((channel) =>
      channel.members.some((candidate) => candidate.id === memberPointerDrag.member?.id),
    );
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
