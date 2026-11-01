import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore, type VoiceState } from "@/features/session";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import { useToast } from "@/shared/composables/useToast";

// The voice barrel loads the audio engine, whose noise suppressor extends AudioWorkletNode (happy-dom has none).
vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});

type Exposed = {
  settingsOpen: boolean;
  audioSettingsError: unknown;
  onInputDeviceChange: (deviceId: string | number | undefined) => Promise<void>;
  onOutputDeviceChange: (deviceId: string | number | undefined) => Promise<void>;
  toggleMicTest: () => Promise<void>;
  audioStatus: { variant: "success" | "warning" | "danger" | "neutral"; label: string };
  micLevelMeter: { setLevel: (level: number) => void } | null;
  setMicLevelMeter: (element: unknown) => void;
  micMeterBars: number;
  meterBarHeight: (index: number) => number;
  toggleMicrophone: () => Promise<void>;
  toggleAccompaniment: () => Promise<void>;
};

function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
  return reactive({
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectFailed: false,
    tsClientId: 0,
    error: "",
    errorCode: "",
    microphoneError: "",
    microphoneErrorCode: "",
    unattributedError: null,
    channelSwitchedChannelId: "",
    ...overrides,
  }) as VoiceState;
}

async function mountUseAudioSettingsPanel(overrides: Record<string, unknown> = {}) {
  const { useAudioSettingsPanel } = await import("@/features/room/audioSettings/useAudioSettingsPanel");
  const options = {
    voiceState: makeVoiceState(),
    microphoneMuted: ref(false),
    microphoneTestActive: ref(false),
    accompanimentActive: ref(false),
    accompanimentErrorCode: ref<"" | "unsupported" | "needsWebRtc" | "noAudio" | "permission">(""),
    audioContextState: ref<AudioContextState | "unknown">("unknown"),
    micLevel: ref(0),
    setInputDevice: vi.fn(async () => undefined),
    setOutputDevice: vi.fn(async () => undefined),
    startMicrophoneTest: vi.fn(async () => undefined),
    stopMicrophoneTest: vi.fn(),
    setMicrophoneMuted: vi.fn(async () => undefined),
    prepareInputDevices: vi.fn(async () => undefined),
    startAccompaniment: vi.fn(async () => undefined),
    stopAccompaniment: vi.fn(async () => undefined),
    ...overrides,
  };
  const wrapper = mount(
    defineComponent({
      setup: () =>
        useAudioSettingsPanel({
          session: { state: options.voiceState },
          audio: options,
        }),
      template: "<div/>",
    }),
  );
  await flushPromises();
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settingsOpen watch", () => {
  it("clears the error and prepares input devices when opened", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel();
    vm.audioSettingsError = "stale";
    vm.settingsOpen = true;
    await flushPromises();
    expect(options.prepareInputDevices).toHaveBeenCalled();
    expect(vm.audioSettingsError).toBe("");
  });

  it("surfaces a localized error when preparing input devices fails", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      prepareInputDevices: vi.fn(async () => {
        throw new Error("no mic");
      }),
    });
    vm.settingsOpen = true;
    await flushPromises();
    expect(vm.audioSettingsError).not.toBe("");
  });

  it("stops the microphone test when closed", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel();
    vm.settingsOpen = true;
    await flushPromises();
    vm.settingsOpen = false;
    await flushPromises();
    expect(options.stopMicrophoneTest).toHaveBeenCalled();
  });
});

describe("onInputDeviceChange", () => {
  it("switches the input device and clears any prior error", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel();
    vm.audioSettingsError = "stale";
    await vm.onInputDeviceChange("device-2");
    expect(options.setInputDevice).toHaveBeenCalledWith("device-2");
    expect(vm.audioSettingsError).toBe("");
  });

  it("passes an empty string when the device id is undefined", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel();
    await vm.onInputDeviceChange(undefined);
    expect(options.setInputDevice).toHaveBeenCalledWith("");
  });

  it("reports a mic-switch error on failure", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      setInputDevice: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    await vm.onInputDeviceChange("device-2");
    expect(vm.audioSettingsError).toEqual({ key: "micSwitchFailed" });
  });
});

describe("onOutputDeviceChange", () => {
  it("switches the output device and clears any prior error", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel();
    vm.audioSettingsError = "stale";
    await vm.onOutputDeviceChange("device-3");
    expect(options.setOutputDevice).toHaveBeenCalledWith("device-3");
    expect(vm.audioSettingsError).toBe("");
  });

  it("keeps the LocalizedText of a LocalizedError, so the message follows the language", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      setOutputDevice: vi.fn(async () => {
        throw new LocalizedError(text("speakerUnavailable"));
      }),
    });
    await vm.onOutputDeviceChange("device-3");
    expect(vm.audioSettingsError).toEqual({ key: "speakerUnavailable" });
  });

  it("shows another Error's message as is", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      setOutputDevice: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await vm.onOutputDeviceChange("device-3");
    expect(vm.audioSettingsError).toBe("boom");
  });

  it("falls back to a generic message for a non-Error throw", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      setOutputDevice: vi.fn(async () => {
        throw "nope";
      }),
    });
    await vm.onOutputDeviceChange("device-3");
    expect(vm.audioSettingsError).toEqual({ key: "speakerSwitchFailed" });
  });
});

describe("toggleMicTest", () => {
  it("starts the test when not active", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel({ microphoneTestActive: ref(false) });
    await vm.toggleMicTest();
    expect(options.startMicrophoneTest).toHaveBeenCalled();
    expect(options.stopMicrophoneTest).not.toHaveBeenCalled();
  });

  it("stops the test when active", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel({ microphoneTestActive: ref(true) });
    await vm.toggleMicTest();
    expect(options.stopMicrophoneTest).toHaveBeenCalled();
    expect(options.startMicrophoneTest).not.toHaveBeenCalled();
  });

  it("reports an error when starting the test fails", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      microphoneTestActive: ref(false),
      startMicrophoneTest: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await vm.toggleMicTest();
    expect(vm.audioSettingsError).not.toBe("");
  });
});

describe("audioStatus", () => {
  it("is success/ready when running without a microphone error", async () => {
    const { vm } = await mountUseAudioSettingsPanel({ audioContextState: ref<AudioContextState | "unknown">("running") });
    expect(vm.audioStatus.variant).toBe("success");
  });

  it("is danger when running with a microphone error", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      audioContextState: ref<AudioContextState | "unknown">("running"),
      voiceState: makeVoiceState({ microphoneError: "denied" }),
    });
    expect(vm.audioStatus.variant).toBe("danger");
  });

  it("is warning when suspended", async () => {
    const { vm } = await mountUseAudioSettingsPanel({ audioContextState: ref<AudioContextState | "unknown">("suspended") });
    expect(vm.audioStatus.variant).toBe("warning");
  });

  it("is neutral otherwise", async () => {
    const { vm } = await mountUseAudioSettingsPanel({ audioContextState: ref<AudioContextState | "unknown">("unknown") });
    expect(vm.audioStatus.variant).toBe("neutral");
  });
});

describe("mic level meter", () => {
  it("writes the level to the bound meter instance on change", async () => {
    const micLevel = ref(0);
    const { vm } = await mountUseAudioSettingsPanel({ micLevel });
    const meter = { setLevel: vi.fn() };
    vm.micLevelMeter = meter;
    micLevel.value = 0.5;
    await flushPromises();
    expect(meter.setLevel).toHaveBeenCalledWith(0.5);
  });

  it("binds the meter through the callback ref used by the child component", async () => {
    const micLevel = ref(0);
    const { vm } = await mountUseAudioSettingsPanel({ micLevel });
    const meter = { setLevel: vi.fn() };
    vm.setMicLevelMeter(meter);
    micLevel.value = 0.25;
    await flushPromises();
    expect(meter.setLevel).toHaveBeenCalledWith(0.25);
  });

  it("derives micMeterBars from micLevel", async () => {
    const { vm } = await mountUseAudioSettingsPanel({ micLevel: ref(0.5) });
    expect(vm.micMeterBars).toBe(12);
  });
});

describe("meterBarHeight", () => {
  it("is flat when the mic test is not active", async () => {
    const { vm } = await mountUseAudioSettingsPanel({ microphoneTestActive: ref(false), micLevel: ref(1) });
    expect(vm.meterBarHeight(0)).toBe(5);
  });

  it("grows with the level when the mic test is active", async () => {
    const { vm } = await mountUseAudioSettingsPanel({ microphoneTestActive: ref(true), micLevel: ref(1) });
    expect(vm.meterBarHeight(0)).toBeGreaterThan(5);
    expect(vm.meterBarHeight(0)).toBeGreaterThanOrEqual(vm.meterBarHeight(23));
  });
});

describe("toggleMicrophone", () => {
  it("unmutes when currently muted", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel({ microphoneMuted: ref(true) });
    await vm.toggleMicrophone();
    expect(options.setMicrophoneMuted).toHaveBeenCalledWith(false);
  });

  it("mutes when currently unmuted", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel({ microphoneMuted: ref(false) });
    await vm.toggleMicrophone();
    expect(options.setMicrophoneMuted).toHaveBeenCalledWith(true);
  });
});

describe("toggleMicrophone when the gateway refuses the mute", () => {
  it("keeps the local state and toasts the reason", async () => {
    const microphoneMuted = ref(false);
    const setMicrophoneMuted = vi.fn(async (muted: boolean) => {
      microphoneMuted.value = muted;
      throw new LocalizedError(text("err_OPERATION_FAILED"), "OPERATION_FAILED");
    });
    const { vm } = await mountUseAudioSettingsPanel({ microphoneMuted, setMicrophoneMuted });
    await vm.toggleMicrophone();
    expect(useSessionStore().roomNotices).toMatchObject([
      {
        code: "MUTE_SYNC_FAILED",
        title: { key: "muteSyncFailed" },
        text: "Others may still see you as unmuted. Your microphone stays off.",
      },
    ]);
  });
});

describe("toggleAccompaniment when the gateway refuses", () => {
  it("toasts the reason instead of the permission text", async () => {
    const startAccompaniment = vi.fn(async () => {
      throw new LocalizedError(text("err_OPERATION_FAILED"), "OPERATION_FAILED");
    });
    const { vm } = await mountUseAudioSettingsPanel({
      accompanimentActive: ref(false),
      accompanimentErrorCode: ref("gateway"),
      startAccompaniment,
    });
    await vm.toggleAccompaniment();
    expect(useToast().toasts.value.at(-1)).toMatchObject({ variant: "danger", title: "Accompaniment sharing failed" });
  });
});

describe("toggleAccompaniment when the gateway has WebRTC off", () => {
  it("toasts that it is not enabled on this gateway", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      accompanimentActive: ref(false),
      accompanimentErrorCode: ref("gatewayDisabled"),
      startAccompaniment: vi.fn(async () => {
        throw new Error("off");
      }),
    });
    await vm.toggleAccompaniment();
    expect(useToast().toasts.value.at(-1)).toMatchObject({ title: "Not enabled on this gateway" });
  });
});

describe("toggleAccompaniment", () => {
  it("starts accompaniment when inactive", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel({ accompanimentActive: ref(false) });
    await vm.toggleAccompaniment();
    expect(options.startAccompaniment).toHaveBeenCalled();
    expect(options.stopAccompaniment).not.toHaveBeenCalled();
  });

  it("stops accompaniment when active", async () => {
    const { vm, options } = await mountUseAudioSettingsPanel({ accompanimentActive: ref(true) });
    await vm.toggleAccompaniment();
    expect(options.stopAccompaniment).toHaveBeenCalled();
    expect(options.startAccompaniment).not.toHaveBeenCalled();
  });

  it("swallows a start failure without throwing", async () => {
    const { vm } = await mountUseAudioSettingsPanel({
      accompanimentActive: ref(false),
      startAccompaniment: vi.fn(async () => {
        throw new Error("boom");
      }),
      accompanimentErrorCode: ref<"" | "unsupported" | "needsWebRtc" | "noAudio" | "permission">("needsWebRtc"),
    });
    await expect(vm.toggleAccompaniment()).resolves.toBeUndefined();
  });
});
