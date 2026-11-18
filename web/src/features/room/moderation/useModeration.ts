import { storeToRefs } from "pinia";
import { computed, reactive } from "vue";
import { toast } from "@/shared/composables/useToast";
import { useDialog } from "@/shared/composables/useDialog";
import { useFormat } from "@/shared/i18n/useFormat";
import { useI18n } from "@/shared/i18n/useI18n";
import { notifyEvent } from "@/features/room/shell/roomNotify";
import { channelNameText, useSessionStore, type ChannelGroup, type ChannelMember, type ServerGroup } from "@/features/session";
import type { RoomSession } from "@/features/room/roomTypes";

export interface UseModerationOptions {
  actions: Pick<RoomSession["actions"], "kickClient" | "banClient" | "setServerGroup" | "setChannelGroup">;
  roster: Pick<RoomSession["roster"], "channels">;
}

/** What a done action tells: what happened, to whom, and a detail. Laid out like the toast of a refused channel switch. */
interface Done {
  title: string;
  description: string;
  note?: string;
}

/** Runs a command and toasts what it did, or its refusal with the reason and the permission it lacked. */
async function attempt(failure: string, run: () => Promise<void>, done: Done): Promise<void> {
  try {
    await run();
    toast({ ...done, variant: "success" });
  } catch (error: unknown) {
    notifyEvent(failure, { error, variant: "danger" });
  }
}

/**
 * What the member menu lets an administrator do to another member: kick, ban, give or take a group. Whether the session may
 * is not known here, the menu always offers it and the server's refusal is what the person is told, as with a channel they
 * lack the join power for.
 */
export function useModeration({ actions, roster }: UseModerationOptions) {
  const { t } = useI18n();
  const format = useFormat();
  const { prompt } = useDialog();
  const { channelGroups } = storeToRefs(useSessionStore());
  /** What a channel group is taken away by: there is no revoke, the member gets the default group instead. */
  const defaultChannel = computed(() => channelGroups.value.find((group) => group.isDefault));

  /** The detail line of a kick or a ban: the reason, when one was given. */
  const reasonNote = (reason: string) => (reason.trim() ? t("toastReasonNote", { reason: reason.trim() }) : undefined);

  /** Where a member is now, for the toast of a channel group, which holds per channel. */
  function channelNameOf(member: ChannelMember): string | undefined {
    const channel = roster.channels.find((candidate) => candidate.members?.some((entry) => entry.id === member.id));
    return channel ? channelNameText(channel, t) : undefined;
  }

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
    await attempt(t("failKick"), () => actions.kickClient(member.id, scope, reason), {
      title: inChannel ? t("toastKickedChannel") : t("toastKickedServer"),
      description: inChannel ? t("toastKickedChannelBody", { nickname }) : t("toastKickedServerBody", { nickname }),
      note: reasonNote(reason),
    });
  }

  function banMember(member: ChannelMember): void {
    banDialog.member = member;
    banDialog.open = true;
  }

  async function confirmBan(seconds: number, reason: string): Promise<void> {
    const { member } = banDialog;
    banDialog.open = false;
    if (!member) return;
    const { nickname } = member;
    // The end is counted from now, on this browser's clock, the same as on the notice of the person who was banned.
    const description =
      seconds === 0
        ? t("toastBannedForeverBody", { nickname })
        : t("toastBannedUntilBody", { nickname, until: format.dateTime(Date.now() + seconds * 1000) });
    await attempt(t("failBan"), () => actions.banClient(member.id, seconds, reason), {
      title: t("toastBanned"),
      description,
      note: reasonNote(reason),
    });
  }

  async function toggleServerGroup(member: ChannelMember, group: ServerGroup): Promise<void> {
    const assigned = !member.serverGroups?.includes(group.id);
    const params = { nickname: member.nickname, group: group.name };
    await attempt(t("failServerGroup"), () => actions.setServerGroup(member.id, group.id, assigned), {
      title: assigned ? t("toastGroupAdded") : t("toastGroupRemoved"),
      description: assigned ? t("memberGroupAdded", params) : t("memberGroupRemoved", params),
    });
  }

  /** Choosing the group a member already has takes it away, which gives them the default group. */
  async function assignChannelGroup(member: ChannelMember, group: ChannelGroup): Promise<void> {
    const target = member.channelGroupId === group.id ? defaultChannel.value : group;
    if (!target) return;
    const channel = channelNameOf(member);
    await attempt(t("failChannelGroup"), () => actions.setChannelGroup(member.id, target.id), {
      title: t("toastChannelGroupSet"),
      description: t("channelGroupSet", { nickname: member.nickname, group: target.name }),
      ...(channel ? { note: t("toastInChannelNote", { channel }) } : {}),
    });
  }

  return { banDialog, kickMember, banMember, confirmBan, toggleServerGroup, assignChannelGroup };
}
