import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { text } from "@/shared/i18n/localizedText";
import { useGatewayErrorToasts } from "@/features/room/shell/useGatewayErrorToasts";

type State = Parameters<typeof useGatewayErrorToasts>[0];

function setup(connected = true) {
  const state = reactive<State>({ connected, unattributedError: null });
  useGatewayErrorToasts(state);
  const raise = async (code: string) => {
    state.unattributedError = { code, text: text(`err_${code}` as "err_FLOOD_PROTECTION") };
    await nextTick();
  };
  return { state, raise };
}

const shown = () => useToast().toasts.value;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
  useToast().dismiss();
});

describe("useGatewayErrorToasts", () => {
  it("toasts an error that answers no request, once", async () => {
    const { raise } = setup();
    await raise("FLOOD_PROTECTION");
    expect(shown()).toMatchObject([{ variant: "danger", title: expect.stringContaining("flood protection") }]);
  });

  it("does not toast before the room is joined", async () => {
    const { raise } = setup(false);
    await raise("SESSION_NOT_READY");
    expect(shown()).toEqual([]);
  });

  it("leaves the channel password prompt to its dialog", async () => {
    const { raise } = setup();
    await raise("CHANNEL_PASSWORD_REQUIRED");
    expect(shown()).toEqual([]);
  });

  it("shows a repeating code once per window, then again after it", async () => {
    const { raise } = setup();
    await raise("INVALID_AUDIO_FRAME");
    vi.setSystemTime(1000);
    await raise("INVALID_AUDIO_FRAME");
    expect(shown()).toHaveLength(1);
    vi.setSystemTime(5001);
    await raise("INVALID_AUDIO_FRAME");
    expect(shown()).toHaveLength(2);
  });

  it("does not let one code hold back another", async () => {
    const { raise } = setup();
    await raise("INVALID_AUDIO_FRAME");
    await raise("FLOOD_PROTECTION");
    expect(shown()).toHaveLength(2);
  });
});
