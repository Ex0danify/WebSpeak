import { flushPromises } from "@vue/test-utils";
import { IDBFactory } from "fake-indexeddb";
import { createPinia, setActivePinia } from "pinia";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalData, listRecentServers } from "@/shared/services/localPersistence";
import { useJoinFormStore } from "./stores/joinFormStore";
import { useServerVisit } from "./useServerVisit";

function setup() {
  const voiceState = reactive({ connected: false });
  const identityMaterial = ref("");
  const form = useJoinFormStore();
  useServerVisit({ voiceState, identityMaterial });
  return { voiceState, identityMaterial, form };
}

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  setActivePinia(createPinia());
  await clearLocalData();
});

describe("useServerVisit", () => {
  it("records the form's target as a recent server when connected flips on, and not before", async () => {
    const { voiceState, form } = setup();
    form.serverHost = "voice.example.com";
    form.serverPort = "9987";
    form.nickname = " Ann ";
    form.channel = "lobby";
    await flushPromises();
    expect(await listRecentServers()).toEqual([]);
    voiceState.connected = true;
    await vi.waitFor(async () => expect(await listRecentServers()).toHaveLength(1));
    const [recent] = await listRecentServers();
    expect(recent?.address).toContain("voice.example.com");
    expect(recent?.nickname).toBe("Ann");
    expect(recent?.lastChannelHint).toEqual({ name: "lobby" });
  });

  it("does nothing without a target", async () => {
    const { voiceState, form } = setup();
    form.serverHost = "";
    voiceState.connected = true;
    await flushPromises();
    expect(await listRecentServers()).toEqual([]);
  });
});
