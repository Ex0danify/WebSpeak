import { onMounted, onUnmounted, ref, type Ref } from "vue";
import { showToast } from "@/shared/composables/useToast";
import { copyToClipboard } from "@/shared/composables/copyToClipboard";
import { useDialog } from "@/shared/composables/useDialog";
import { useI18n } from "@/shared/i18n/useI18n";
import { notifyEvent } from "@/features/room/shell/roomNotify";
import { channelNameText, type ChannelMember, type PokeNotification } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes";

export interface UseRoomShellOptions {
  memberMenu: Ref<{ member: ChannelMember; x: number; y: number } | null>;
  pokeNotifications: PokeNotification[];
  accompanimentActive: Ref<boolean>;
  stopAccompaniment: () => Promise<void> | void;
  refreshAudioDevices: () => Promise<unknown>;
  sendPoke: (clientId: number, message: string) => Promise<void>;
}

/** Shell state of the connected room: the mobile viewport flag and active mobile section, the
 *  viewport and `devicechange` listeners (registered on mount, removed on unmount), and the member
 *  actions the shell owns (poke, copy nickname, dismiss a poke banner). */
export function useRoomShell({
  memberMenu,
  pokeNotifications,
  accompanimentActive,
  stopAccompaniment,
  refreshAudioDevices,
  sendPoke,
}: UseRoomShellOptions) {
  const { t } = useI18n();
  const { prompt } = useDialog();
  const mobileSection = ref<"channels" | "chat" | "voice" | "more">("channels");
  const isMobileViewport = ref(false);

  let deviceChangeHandler: (() => void) | undefined;
  let viewportMediaQuery: MediaQueryList | undefined;
  let viewportChangeHandler: (() => void) | undefined;

  onMounted(() => {
    deviceChangeHandler = () => {
      void refreshAudioDevices().catch(() => undefined);
    };
    navigator.mediaDevices?.addEventListener("devicechange", deviceChangeHandler);
    viewportMediaQuery = window.matchMedia("(max-width: 740px)");
    viewportChangeHandler = () => {
      isMobileViewport.value = viewportMediaQuery?.matches ?? false;
      if (!isMobileViewport.value) memberMenu.value = null;
      else if (accompanimentActive.value) void stopAccompaniment();
    };
    viewportChangeHandler();
    viewportMediaQuery.addEventListener?.("change", viewportChangeHandler);
  });
  onUnmounted(() => {
    if (deviceChangeHandler) navigator.mediaDevices?.removeEventListener("devicechange", deviceChangeHandler);
    if (viewportMediaQuery && viewportChangeHandler) viewportMediaQuery.removeEventListener?.("change", viewportChangeHandler);
  });

  async function pokeMember(member: ChannelMember): Promise<void> {
    const message = await prompt({
      title: t("pokeDialogTitle", { nickname: member.nickname }),
      label: t("pokeMessagePrompt"),
      placeholder: t("pokePlaceholder"),
      confirmLabel: t("poke"),
      cancelLabel: t("cancel"),
    });
    if (message === null) return;
    try {
      await sendPoke(member.id, message);
      showToast(t("pokeSent"));
    } catch (error: unknown) {
      notifyEvent(t("failPoke"), { error, variant: "danger" });
    }
  }

  function copyMemberName(member: ChannelMember): void {
    copyToClipboard(member.nickname, { copied: t("copiedNickname"), failed: t("copyFailedToast") });
  }

  function copyChannelName(channel: TreeChannel): void {
    copyToClipboard(channelNameText(channel, t), { copied: t("copiedChannelName"), failed: t("copyFailedToast") });
  }

  function dismissPoke(id: string): void {
    const index = pokeNotifications.findIndex((poke) => poke.id === id);
    if (index >= 0) pokeNotifications.splice(index, 1);
  }

  return { mobileSection, isMobileViewport, pokeMember, copyMemberName, copyChannelName, dismissPoke };
}
