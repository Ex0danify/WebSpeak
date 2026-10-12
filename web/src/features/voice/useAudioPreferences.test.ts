// useAudioPreferences on its own: stores plus a fake IndexedDB, and the deps as spies.
import { IDBFactory } from "fake-indexeddb";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Persistence from "@/shared/services/localPersistence";
import { useVoiceAudioStore } from "./stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import { useAudioPreferences } from "./useAudioPreferences";

let persistence: typeof Persistence;

beforeAll(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  persistence = await import("@/shared/services/localPersistence");
});
beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  await persistence.clearLocalData();
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  const deps = { applyMemberVolume: vi.fn(), applyInputVolume: vi.fn(), applyOutputVolume: vi.fn() };
  const prefs = useAudioPreferences(deps);
  return { deps, prefs, audio: useVoiceAudioStore(), session: useSessionStore() };
}

/** Lets the fire-and-forget save that a setter starts reach IndexedDB. */
async function settled(prefs: ReturnType<typeof setup>["prefs"]): Promise<void> {
  await prefs.saveAudioPreferences();
}

describe("loading", () => {
  it("applies stored preferences, clamped, once audioPreferencesReady resolves", async () => {
    await persistence.saveLocalPreferences({
      schemaVersion: 1,
      preferredInputDeviceId: "mic-1",
      microphoneMuted: true,
      noiseSuppressionEnabled: false,
      voxThreshold: 5,
      inputGain: 3,
      outputVolume: -1,
      notificationVolume: 0.25,
      preferredOutputDeviceId: "spk-1",
      volumesByUid: { u1: 2 },
    });
    const { prefs, audio } = setup();
    await prefs.audioPreferencesReady;
    expect(audio.selectedInputDeviceId).toBe("mic-1");
    expect(audio.selectedOutputDeviceId).toBe("spk-1");
    expect(audio.microphoneMuted).toBe(true);
    expect(audio.noiseSuppressionEnabled).toBe(false);
    expect(audio.voxThreshold).toBe(0.08);
    expect(audio.inputVolume).toBe(1);
    expect(audio.outputVolume).toBe(0);
    expect(audio.notificationVolume).toBe(0.25);
  });

  it("keeps a device id that was already read from safe-storage", async () => {
    localStorage.setItem("webspeak:input-device", "from-storage");
    setActivePinia(createPinia());
    await persistence.saveLocalPreferences({ schemaVersion: 1, preferredInputDeviceId: "from-db" });
    const { prefs, audio } = setup();
    await prefs.audioPreferencesReady;
    expect(audio.selectedInputDeviceId).toBe("from-storage");
  });

  it("gives remembered volumes to members already in the room", async () => {
    await persistence.saveLocalPreferences({ schemaVersion: 1, volumesByUid: { u1: 9, u2: 0.5 } });
    const { prefs, audio, session } = setup();
    session.members.push({ id: 3, nickname: "A", uid: "u1" }, { id: 4, nickname: "B" });
    await prefs.audioPreferencesReady;
    expect(audio.volumes).toEqual({ 3: 4 });
  });

  it("syncKnownMemberVolumes picks up members who arrive later", async () => {
    await persistence.saveLocalPreferences({ schemaVersion: 1, volumesByUid: { u2: 0.5 } });
    const { prefs, audio, session } = setup();
    await prefs.audioPreferencesReady;
    session.members.push({ id: 8, nickname: "B", uid: "u2" });
    prefs.syncKnownMemberVolumes();
    expect(audio.volumes[8]).toBe(0.5);
  });
});

describe("setters", () => {
  it("setVolume clamps to 0..4, updates the store, calls the gain callback, and remembers it by uid", async () => {
    const { prefs, deps, audio, session } = setup();
    await prefs.audioPreferencesReady;
    session.members.push({ id: 3, nickname: "A", uid: "u1" });
    prefs.setVolume(3, 9);
    expect(audio.volumes[3]).toBe(4);
    expect(deps.applyMemberVolume).toHaveBeenCalledWith(3, 4);
    await settled(prefs);
    expect((await persistence.loadLocalPreferences()).volumesByUid).toEqual({ u1: 4 });
    prefs.setVolume(3, -2);
    expect(audio.volumes[3]).toBe(0);
    await settled(prefs);
  });

  it("setVolume for a member without a uid is applied but not stored", async () => {
    const { prefs, deps, audio, session } = setup();
    await prefs.audioPreferencesReady;
    session.members.push({ id: 5, nickname: "Guest" });
    prefs.setVolume(5, 2);
    expect(audio.volumes[5]).toBe(2);
    expect(deps.applyMemberVolume).toHaveBeenCalledWith(5, 2);
    await settled(prefs);
    expect((await persistence.loadLocalPreferences()).volumesByUid ?? {}).toEqual({});
  });

  it("setVolume for an unknown client id still applies", async () => {
    const { prefs, deps, audio } = setup();
    await prefs.audioPreferencesReady;
    prefs.setVolume(99, 1.5);
    expect(audio.volumes[99]).toBe(1.5);
    expect(deps.applyMemberVolume).toHaveBeenCalledWith(99, 1.5);
  });

  it("setInputVolume clamps to 0..1 and calls the input callback after the store changed", async () => {
    const { prefs, deps, audio } = setup();
    await prefs.audioPreferencesReady;
    deps.applyInputVolume.mockImplementationOnce(() => expect(audio.inputVolume).toBe(1));
    prefs.setInputVolume(5);
    expect(deps.applyInputVolume).toHaveBeenCalledTimes(1);
    prefs.setInputVolume(-1);
    expect(audio.inputVolume).toBe(0);
  });

  it("setOutputVolume clamps and applies; toggleOutputMute toggles and applies without saving", async () => {
    const { prefs, deps, audio } = setup();
    await prefs.audioPreferencesReady;
    prefs.setOutputVolume(7);
    expect(audio.outputVolume).toBe(1);
    prefs.setOutputVolume(0.3);
    expect(audio.outputVolume).toBe(0.3);
    expect(deps.applyOutputVolume).toHaveBeenCalledTimes(2);
    const save = vi.spyOn(persistence, "saveLocalPreferences");
    prefs.toggleOutputMute();
    expect(audio.outputMuted).toBe(true);
    prefs.toggleOutputMute();
    expect(audio.outputMuted).toBe(false);
    expect(deps.applyOutputVolume).toHaveBeenCalledTimes(4);
    expect(save).not.toHaveBeenCalled();
  });

  it("setVoxThreshold clamps to 0.001..0.08 and setNotificationVolume to 0..1", async () => {
    const { prefs, audio } = setup();
    await prefs.audioPreferencesReady;
    prefs.setVoxThreshold(1);
    expect(audio.voxThreshold).toBe(0.08);
    prefs.setVoxThreshold(0);
    expect(audio.voxThreshold).toBe(0.001);
    prefs.setNotificationVolume(2);
    expect(audio.notificationVolume).toBe(1);
    prefs.setNotificationVolume(-2);
    expect(audio.notificationVolume).toBe(0);
  });
});

describe("persistence round trip", () => {
  it("what the setters save is what a fresh instance loads", async () => {
    const first = setup();
    await first.prefs.audioPreferencesReady;
    first.audio.selectedInputDeviceId = "mic-9";
    first.audio.selectedOutputDeviceId = "spk-9";
    first.audio.microphoneMuted = true;
    first.audio.noiseSuppressionEnabled = false;
    first.session.members.push({ id: 3, nickname: "A", uid: "u1" });
    first.prefs.setVoxThreshold(0.02);
    first.prefs.setInputVolume(0.6);
    first.prefs.setOutputVolume(0.4);
    first.prefs.setNotificationVolume(0.7);
    first.prefs.setVolume(3, 2.5);
    await first.prefs.saveAudioPreferences();
    expect(await persistence.loadLocalPreferences()).toMatchObject({
      preferredInputDeviceId: "mic-9",
      inputDeviceId: "mic-9",
      preferredOutputDeviceId: "spk-9",
      microphoneMuted: true,
      noiseSuppressionEnabled: false,
      voxThreshold: 0.02,
      inputGain: 0.6,
      outputVolume: 0.4,
      notificationVolume: 0.7,
      volumesByUid: { u1: 2.5 },
    });

    setActivePinia(createPinia());
    const second = setup();
    second.session.members.push({ id: 11, nickname: "A again", uid: "u1" });
    await second.prefs.audioPreferencesReady;
    expect(second.audio).toMatchObject({
      selectedInputDeviceId: "mic-9",
      selectedOutputDeviceId: "spk-9",
      microphoneMuted: true,
      noiseSuppressionEnabled: false,
      voxThreshold: 0.02,
      inputVolume: 0.6,
      outputVolume: 0.4,
      notificationVolume: 0.7,
    });
    expect(second.audio.volumes[11]).toBe(2.5);
  });
});
