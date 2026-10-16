import { mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import type { ChannelMember } from "@/features/session";
import { useRoomShell } from "@/features/room/shell/useRoomShell";

const member = { id: 2, nickname: "Ana", isSelf: false } as ChannelMember;

function mountShell(sendPoke: (clientId: number, message: string) => Promise<void>) {
  let shell!: ReturnType<typeof useRoomShell>;
  mount(
    defineComponent({
      setup() {
        shell = useRoomShell({
          memberMenu: ref(null),
          pokeNotifications: reactive([]),
          accompanimentActive: ref(false),
          stopAccompaniment: vi.fn(),
          refreshAudioDevices: vi.fn(async () => undefined),
          sendPoke,
        });
        return () => null;
      },
    }),
  );
  return shell;
}

beforeEach(() => {
  useToast().dismiss();
  vi.stubGlobal(
    "prompt",
    vi.fn(() => "hi"),
  );
});

describe("pokeMember", () => {
  it("toasts success once the gateway completed the poke", async () => {
    await mountShell(async () => undefined).pokeMember(member);
    expect(useToast().toasts.value.at(-1)).toMatchObject({ variant: "success" });
  });

  it("toasts the refusal instead of success when the gateway refuses the poke", async () => {
    const refused = async () => {
      throw new LocalizedError(text("err_PERMISSION_DENIED"), "PERMISSION_DENIED");
    };
    await mountShell(refused).pokeMember(member);
    expect(useToast().toasts.value).toHaveLength(1);
    expect(useToast().toasts.value[0]).toMatchObject({ variant: "danger" });
  });
});
