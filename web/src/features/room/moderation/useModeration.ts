import { storeToRefs } from "pinia";
import { computed, reactive } from "vue";
import { showToast } from "@/shared/composables/useToast";
import { useDialog } from "@/shared/composables/useDialog";
import { useI18n } from "@/shared/i18n/useI18n";
import { notifyEvent } from "@/features/room/shell/roomNotify";
import { useSessionStore, type ChannelGroup, type ChannelMember, type ServerGroup } from "@/features/session";
import type { RoomSession } from "@/features/room/roomTypes";

export interface UseModerationOptions {
  actions: Pick<RoomSession["actions"], "kickClient" | "banClient" | "setServerGroup" | "setChannelGroup">;
}

/** Runs a command and toasts its success, or its refusal with the reason and the permission it lacked. */
async function attempt(failure: string, run: () => Promise<void>, success: string): Promise<void> {
  try {
    await run();
    showToast(success);
  } catch (error: unknown) {
    notifyEvent(failure, { error, variant: "danger" });
  }
}

/**
 * What the member menu lets an administrator do to another member: kick, ban, give or take a group. Whether the session may
 * is not known here, the menu always offers it and the server's refusal is what the person is told, as with a channel they
 * lack the join power for.
 */
export function useModeration({ actions }: UseModerationOptions) {
  const { t } = useI18n();
  const { prompt } = useDialog();
  const { channelGroups } = storeToRefs(useSessionStore());
  /** What a channel group is taken away by: there is no revoke, the member gets the default group instead. */
  const defaultChannel = computed(() => channelGroups.value.find((group) => group.isDefault));

  /** The ban dialog, which asks for a length besides the reason. */
  const banDialog = reactive<{ open: boolean; member: ChannelMember | null }>({ open: false, member: null });

  async function kickMember(member: ChannelMember, scope: "channel" | "server"): Promise<void> {
    const { nickname } = member;
    const inChannel = scope === "channel";
    const reason = await prompt({
      title: inChannel ? t("kickChannelTitle", { nickname }) : t("kickServerTitle", { nickname }),
      label: t("moderationReasonPrompt"),
      confirmLabel: t("kickConfirm"),
      cancelLabel: t("cancel"),
    });
    if (reason === null) return;
    await attempt(
      t("failKick"),
      () => actions.kickClient(member.id, scope, reason),
      inChannel ? t("kickedFromChannel", { nickname }) : t("kickedFromServer", { nickname }),
    );
  }

  function banMember(member: ChannelMember): void {
    banDialog.member = member;
    banDialog.open = true;
  }

  async function confirmBan(seconds: number, reason: string): Promise<void> {
    const { member } = banDialog;
    banDialog.open = false;
    if (!member) return;
    await attempt(t("failBan"), () => actions.banClient(member.id, seconds, reason), t("bannedMember", { nickname: member.nickname }));
  }

  async function toggleServerGroup(member: ChannelMember, group: ServerGroup): Promise<void> {
    const assigned = !member.serverGroups?.includes(group.id);
    const params = { nickname: member.nickname, group: group.name };
    await attempt(
      t("failServerGroup"),
      () => actions.setServerGroup(member.id, group.id, assigned),
      assigned ? t("memberGroupAdded", params) : t("memberGroupRemoved", params),
    );
  }

  /** Choosing the group a member already has takes it away, which gives them the default group. */
  async function assignChannelGroup(member: ChannelMember, group: ChannelGroup): Promise<void> {
    const target = member.channelGroupId === group.id ? defaultChannel.value : group;
    if (!target) return;
    await attempt(
      t("failChannelGroup"),
      () => actions.setChannelGroup(member.id, target.id),
      t("channelGroupSet", { nickname: member.nickname, group: target.name }),
    );
  }

  return { banDialog, kickMember, banMember, confirmBan, toggleServerGroup, assignChannelGroup };
}
