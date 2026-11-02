import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJoinFormStore } from "@/features/join";
import { useNicknameChange } from "@/features/room/profile/useNicknameChange";

const saveLocalPreferences = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/shared/services/localPersistence", () => ({ saveLocalPreferences }));

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  saveLocalPreferences.mockClear();
});

describe("useNicknameChange", () => {
  it("renames on the server and then carries the name over to the next join", async () => {
    const setNickname = vi.fn().mockResolvedValue(undefined);
    await useNicknameChange({ setNickname })("Ex0-web");
    expect(setNickname).toHaveBeenCalledWith("Ex0-web");
    expect(useJoinFormStore().nickname).toBe("Ex0-web");
    expect(localStorage.getItem("webspeak:nickname")).toBe("Ex0-web");
    expect(saveLocalPreferences).toHaveBeenCalledWith({ schemaVersion: 1, lastNickname: "Ex0-web" });
  });

  it("keeps the old name everywhere when the server refuses", async () => {
    const store = useJoinFormStore();
    store.nickname = "roka";
    const setNickname = vi.fn().mockRejectedValue(new Error("taken"));
    await expect(useNicknameChange({ setNickname })("Ex0-web")).rejects.toThrow("taken");
    expect(store.nickname).toBe("roka");
    expect(localStorage.getItem("webspeak:nickname")).toBeNull();
    expect(saveLocalPreferences).not.toHaveBeenCalled();
  });
});
