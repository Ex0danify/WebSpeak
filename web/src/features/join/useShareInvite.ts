import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { toast as raiseToast } from "@/shared/composables/useToast.js";
import { useJoinFormStore } from "@/features/join/stores/joinFormStore";

/** The room's "copy invite link" action. It reads the join fields from `joinFormStore`, which
 *  outlive the join page, so it works after the join form is gone. */
export function useShareInvite() {
  const { t } = useI18n();
  const { serverHost, serverId, channel, accessMode, serverTarget } = storeToRefs(useJoinFormStore());

  function notify(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  function doShare() {
    const invite = new URL(location.href);
    invite.pathname = "/"; // the room lives at /room, the link has to open the join page
    invite.searchParams.delete("token");
    invite.searchParams.delete("target");
    invite.searchParams.delete("tsHost");
    invite.searchParams.delete("tsPort");
    invite.searchParams.delete("server");
    invite.searchParams.delete("serverId");
    // A configured server is named by id, a typed address only travels in open access.
    if (serverId.value) invite.searchParams.set("serverId", serverId.value);
    else if (accessMode.value === "open" && serverHost.value.trim()) invite.searchParams.set("server", serverTarget.value);
    if (channel.value) invite.searchParams.set("channel", channel.value);
    navigator.clipboard?.writeText(invite.toString()).then(
      () => notify(t("copiedToast")),
      () => notify(t("copyFailedToast"), "danger"),
    );
  }

  return { doShare };
}
