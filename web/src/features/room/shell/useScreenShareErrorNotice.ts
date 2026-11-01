import { watch, type Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { notifyEvent } from "@/features/room/shell/roomNotify";

/** A failed or refused screen share is easy to miss in the voice grid, so it also gets a toast. */
export function useScreenShareErrorNotice(errorText: Ref<string>): void {
  const { t } = useI18n();
  watch(errorText, (reason) => {
    if (reason) notifyEvent(t("failScreenShare"), { variant: "danger", reason });
  });
}
