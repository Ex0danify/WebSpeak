import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import type { ChannelMember } from "@/features/session";

type Exposed = {
  whisperPttActive: boolean;
  whisperTargets: ChannelMember[];
  toggleWhisperTarget: (member: ChannelMember) => Promise<void>;
  clearWhisperTargets: () => Promise<void>;
  onWhisperPttDown: (event: PointerEvent) => void;
  onWhisperPttUp: (event: PointerEvent) => void;
  stopWhisperTalk: () => void;
};

function member(id: number, nickname: string, overrides: Partial<ChannelMember> = {}): ChannelMember {
  return { id, nickname, ...overrides };
}

function pointerEvent(pointerId = 1, capture = false): PointerEvent {
  const target = {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => capture),
  };
  return { pointerId, currentTarget: target } as unknown as PointerEvent;
}

async function mountUseWhisper(overrides: Record<string, unknown> = {}) {
  const { useWhisper } = await import("./useWhisper");
  const whisperTargetIds = reactive(new Set<number>()) as Set<number>;
  const members = reactive<ChannelMember[]>([member(1, "Lucas", { isSelf: true }), member(2, "Ana"), member(3, "Ben")]);
  const options = {
    whisperTargetIds,
    members,
    setWhisperTargets: vi.fn(),
    setWhisperActive: vi.fn(async () => undefined),
    ...overrides,
  };
  const wrapper = mount(
    defineComponent({
      setup: () =>
        useWhisper({
          roster: { whisperTargetIds: options.whisperTargetIds, members: options.members },
          actions: { setWhisperTargets: options.setWhisperTargets, setWhisperActive: options.setWhisperActive },
        }),
      template: "<div/>",
    }),
  );
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options, whisperTargetIds };
}

beforeEach(() => {
  useToast().dismiss();
});

const refused = async () => {
  throw new LocalizedError(text("err_CLIENT_NOT_FOUND"), "CLIENT_NOT_FOUND");
};

describe("toggleWhisperTarget", () => {
  it("toasts success once the gateway accepted the target", async () => {
    const { vm } = await mountUseWhisper();
    await vm.toggleWhisperTarget(member(2, "Ana"));
    expect(useToast().toasts.value.map((toast) => toast.variant)).toEqual(["success"]);
  });

  it("toasts the refusal instead of success when the gateway refuses the target", async () => {
    const { vm } = await mountUseWhisper({ setWhisperTargets: vi.fn(refused) });
    await vm.toggleWhisperTarget(member(2, "Ana"));
    expect(useToast().toasts.value.map((toast) => toast.variant)).toEqual(["danger"]);
  });

  it("adds a member not yet targeted", async () => {
    const { vm, options } = await mountUseWhisper();
    await vm.toggleWhisperTarget(member(2, "Ana"));
    expect(options.setWhisperTargets).toHaveBeenCalledWith([2]);
  });

  it("removes a member already targeted", async () => {
    const { vm, options, whisperTargetIds } = await mountUseWhisper();
    whisperTargetIds.add(2);
    await vm.toggleWhisperTarget(member(2, "Ana"));
    expect(options.setWhisperTargets).toHaveBeenCalledWith([]);
  });

  it("ignores the self row", async () => {
    const { vm, options } = await mountUseWhisper();
    await vm.toggleWhisperTarget(member(1, "Lucas", { isSelf: true }));
    expect(options.setWhisperTargets).not.toHaveBeenCalled();
  });

  it("stops adding once 8 targets are selected", async () => {
    const { vm, options, whisperTargetIds } = await mountUseWhisper();
    for (let id = 10; id < 18; id++) whisperTargetIds.add(id);
    await vm.toggleWhisperTarget(member(2, "Ana"));
    expect(options.setWhisperTargets).toHaveBeenCalledWith([...whisperTargetIds]);
    expect(options.setWhisperTargets).not.toHaveBeenCalledWith(expect.arrayContaining([2]));
  });
});

describe("clearWhisperTargets", () => {
  it("toasts the refusal when the gateway refuses to clear the targets", async () => {
    const { vm } = await mountUseWhisper({ setWhisperTargets: vi.fn(refused) });
    await vm.clearWhisperTargets();
    expect(useToast().toasts.value.map((toast) => toast.variant)).toEqual(["danger"]);
  });

  it("stops an active whisper talk and clears the targets", async () => {
    const { vm, options, whisperTargetIds } = await mountUseWhisper();
    whisperTargetIds.add(2);
    vm.onWhisperPttDown(pointerEvent());
    expect(vm.whisperPttActive).toBe(true);

    await vm.clearWhisperTargets();
    expect(vm.whisperPttActive).toBe(false);
    expect(options.setWhisperActive).toHaveBeenLastCalledWith(false);
    expect(options.setWhisperTargets).toHaveBeenLastCalledWith([]);
  });
});

describe("a refused whisper activation", () => {
  it("releases the held button and toasts the reason", async () => {
    const { vm, whisperTargetIds } = await mountUseWhisper({ setWhisperActive: vi.fn(refused) });
    whisperTargetIds.add(2);
    vm.onWhisperPttDown(pointerEvent());
    expect(vm.whisperPttActive).toBe(true);
    await flushPromises();
    expect(vm.whisperPttActive).toBe(false);
    expect(useToast().toasts.value.map((toast) => toast.variant)).toEqual(["danger"]);
  });
});

describe("whisperTargets", () => {
  it("resolves target ids against the member list", async () => {
    const { vm, whisperTargetIds } = await mountUseWhisper();
    whisperTargetIds.add(2);
    whisperTargetIds.add(3);
    await nextTick();
    expect(vm.whisperTargets.map((target) => target.id)).toEqual([2, 3]);
  });

  it("drops a target id with no matching member", async () => {
    const { vm, whisperTargetIds } = await mountUseWhisper();
    whisperTargetIds.add(99);
    await nextTick();
    expect(vm.whisperTargets).toEqual([]);
  });
});

describe("push-to-talk", () => {
  it("does nothing on pointer down when no targets are selected", async () => {
    const { vm, options } = await mountUseWhisper();
    vm.onWhisperPttDown(pointerEvent());
    expect(vm.whisperPttActive).toBe(false);
    expect(options.setWhisperActive).not.toHaveBeenCalled();
  });

  it("captures the pointer and activates whisper on pointer down", async () => {
    const { vm, options, whisperTargetIds } = await mountUseWhisper();
    whisperTargetIds.add(2);
    const event = pointerEvent(7);
    vm.onWhisperPttDown(event);
    expect((event.currentTarget as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture).toHaveBeenCalledWith(7);
    expect(vm.whisperPttActive).toBe(true);
    expect(options.setWhisperActive).toHaveBeenCalledWith(true);
  });

  it("releases the pointer and deactivates whisper on pointer up", async () => {
    const { vm, options, whisperTargetIds } = await mountUseWhisper();
    whisperTargetIds.add(2);
    vm.onWhisperPttDown(pointerEvent(7, true));
    const upEvent = pointerEvent(7, true);
    vm.onWhisperPttUp(upEvent);
    expect(
      (upEvent.currentTarget as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture,
    ).toHaveBeenCalledWith(7);
    expect(vm.whisperPttActive).toBe(false);
    expect(options.setWhisperActive).toHaveBeenLastCalledWith(false);
  });

  it("stopWhisperTalk is a no-op when not currently talking", async () => {
    const { vm, options } = await mountUseWhisper();
    vm.stopWhisperTalk();
    expect(options.setWhisperActive).not.toHaveBeenCalled();
  });
});
