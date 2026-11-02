import { useJoinFormStore } from "@/features/join";
import { saveLocalPreferences } from "@/shared/services/localPersistence";
import { writeStorage } from "@/shared/services/safeStorage";

/** Renames the own client and, once the server took the name, makes it the one the next join starts with. */
export function useNicknameChange(options: { setNickname: (nickname: string) => Promise<void> }) {
  const joinForm = useJoinFormStore();

  return async function changeNickname(nickname: string): Promise<void> {
    await options.setNickname(nickname);
    joinForm.nickname = nickname;
    writeStorage("webspeak:nickname", nickname);
    void saveLocalPreferences({ schemaVersion: 1, lastNickname: nickname });
  };
}
