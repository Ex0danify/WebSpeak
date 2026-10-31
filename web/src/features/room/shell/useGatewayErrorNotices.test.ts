import { createPinia, setActivePinia } from "pinia";
import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { text } from "@/shared/i18n/localizedText";
import { useSessionStore } from "@/features/session";
import { useGatewayErrorNotices } from "@/features/room/shell/useGatewayErrorNotices";

type State = Parameters<typeof useGatewayErrorNotices>[0];

function setup(connected = true) {
  const state = reactive<State>({ connected, unattributedError: null });
  useGatewayErrorNotices(state);
  const raise = async (code: string) => {
    state.unattributedError = { code, text: text(`err_${code}` as "err_FLOOD_PROTECTION") };
    await nextTick();
  };
  return { state, raise };
}

const toasts = () => useToast().toasts.value;
const notices = () => useSessionStore().roomNotices;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
  useToast().dismiss();
});

describe("useGatewayErrorNotices", () => {
  it("toasts a one-off error that answers no request, once", async () => {
    const { raise } = setup();
    await raise("FLOOD_PROTECTION");
    expect(toasts()).toMatchObject([{ variant: "danger", title: expect.stringContaining("flood protection") }]);
    expect(notices()).toEqual([]);
  });

  it("shows a condition as a room notice, not a toast", async () => {
    const { raise } = setup();
    await raise("INVALID_AUDIO_FRAME");
    expect(toasts()).toEqual([]);
    expect(notices()).toMatchObject([{ code: "INVALID_AUDIO_FRAME", text: { key: "err_INVALID_AUDIO_FRAME" } }]);
  });

  it("gives each condition the severity listed for it", async () => {
    const { raise } = setup();
    await raise("INVALID_AUDIO_FRAME");
    await raise("SESSION_NOT_READY");
    await raise("WEBRTC_DISABLED");
    expect(Object.fromEntries(notices().map((notice) => [notice.code, notice.variant]))).toEqual({
      INVALID_AUDIO_FRAME: "danger",
      SESSION_NOT_READY: "warning",
      WEBRTC_DISABLED: "warning",
    });
  });

  it("lets the condition lapse once the errors stop, and keeps it while they continue", async () => {
    const { raise } = setup();
    await raise("INVALID_AUDIO_FRAME");
    vi.advanceTimersByTime(8000);
    await raise("INVALID_AUDIO_FRAME");
    vi.advanceTimersByTime(8000);
    expect(notices()).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(notices()).toEqual([]);
  });

  it("does not show anything before the room is joined", async () => {
    const { raise } = setup(false);
    await raise("SESSION_NOT_READY");
    await raise("FLOOD_PROTECTION");
    expect(toasts()).toEqual([]);
    expect(notices()).toEqual([]);
  });

  it("leaves the channel password prompt to its dialog", async () => {
    const { raise } = setup();
    await raise("CHANNEL_PASSWORD_REQUIRED");
    expect(toasts()).toEqual([]);
    expect(notices()).toEqual([]);
  });

  it("toasts a repeating code once per window, then again after it", async () => {
    const { raise } = setup();
    await raise("FLOOD_PROTECTION");
    vi.setSystemTime(1000);
    await raise("FLOOD_PROTECTION");
    expect(toasts()).toHaveLength(1);
    vi.setSystemTime(5001);
    await raise("FLOOD_PROTECTION");
    expect(toasts()).toHaveLength(2);
  });
});
