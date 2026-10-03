import { ref, watch } from "vue";
import type { VoiceState } from "@/features/session";

export interface UseJoinScreenOptions {
  voiceState: VoiceState;
  serverPasswordDialog: { open: boolean; password: string; errorCode: string };
  clearError: () => void;
}

/** Dialogs and connect-time hooks of the join screen: the server-password dialog opens when the
 *  gateway reports `SERVER_PASSWORD_REQUIRED` / `INVALID_SERVER_PASSWORD`, the QQ dialog is a plain
 *  open flag. */
export function useJoinScreen({ voiceState, serverPasswordDialog, clearError }: UseJoinScreenOptions) {
  const qqModalOpen = ref(false);

  watch(() => voiceState.errorCode, (code) => {
    if (code !== "SERVER_PASSWORD_REQUIRED" && code !== "INVALID_SERVER_PASSWORD") return;
    serverPasswordDialog.open = true;
    serverPasswordDialog.password = "";
    serverPasswordDialog.errorCode = code;
    clearError();
  });

  return { qqModalOpen };
}
