import { mount } from "@vue/test-utils";
import { defineComponent, h, ref, type PropType } from "vue";
import { describe, expect, it, vi } from "vitest";
import IdentityPicker from "@/features/identity/IdentityPicker.vue";
import type { ListSelectItem } from "@/shared/ui/select";
import type { MintState, useIdentityManager } from "@/features/identity/useIdentityManager";
import type { StoredIdentity } from "@/shared/services/localPersistence";

type Manager = ReturnType<typeof useIdentityManager>;

// A light stand-in for the reka-backed ListSelect, whose popup is portaled and closed in tests. It renders
// the trigger and every row through the real slots and emits a selection on row click, so the picker's item
// building, value mapping and row decoration stay testable. The reka wiring has its own test.
const ListSelectStub = defineComponent({
  name: "ListSelect",
  props: {
    modelValue: { type: String, default: undefined },
    items: { type: Array as PropType<ListSelectItem[]>, default: () => [] },
  },
  emits: ["update:modelValue"],
  setup(props, { slots, emit }) {
    return () =>
      h("div", [
        h("div", { class: "ls-value" }, slots.value?.({ item: props.items.find((item) => item.value === props.modelValue) })),
        h(
          "ul",
          props.items.map((item) =>
            h(
              "li",
              { class: "ls-item", "data-value": item.value, onClick: () => emit("update:modelValue", item.value) },
              slots.item?.({ item, selected: item.value === props.modelValue }),
            ),
          ),
        ),
      ]);
  },
});

function fakeManager(overrides: Partial<Record<keyof Manager, unknown>> = {}): Manager {
  const identities: StoredIdentity[] = [
    { id: "a", label: "Alpha", privateMaterial: "x", createdAt: 0, lastUsedAt: 0 },
    { id: "b", label: "", privateMaterial: "y", createdAt: 0, lastUsedAt: 0 },
  ];
  return {
    identities: ref(identities),
    selectedId: ref<string | undefined>("a"),
    defaultId: ref<string | undefined>("a"),
    mintState: ref<MintState>({ phase: "idle" }),
    init: vi.fn(),
    refresh: vi.fn(),
    select: vi.fn(),
    setDefault: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    exportIdentity: vi.fn(),
    importIdentity: vi.fn(),
    ...overrides,
  } as unknown as Manager;
}

function mountPicker(manager: Manager, props: Record<string, unknown> = {}) {
  return mount(IdentityPicker, { props: { manager, ...props }, global: { stubs: { ListSelect: ListSelectStub } } });
}

describe("IdentityPicker", () => {
  it("lists the ephemeral option, saved identities, the unnamed fallback and marks the default", () => {
    const rows = mountPicker(fakeManager())
      .findAll(".ls-item")
      .map((row) => row.text());
    expect(rows).toEqual(["Temporary identity", "Alpha (default)", "Unnamed identity"]);
  });

  it("italicises the whole ephemeral row but only the (default) tag", () => {
    const wrapper = mountPicker(fakeManager());
    const rows = wrapper.findAll(".ls-item");
    expect(rows[0].find("span.italic").text()).toBe("Temporary identity"); // ephemeral label italic
    const defaultItalic = rows[1].find("span.italic");
    expect(defaultItalic.text()).toBe("(default)"); // only the tag is italic, not "Alpha"
    expect(rows[1].text()).toContain("Alpha");
    expect(rows[2].find("span.italic").exists()).toBe(false); // plain row has none
  });

  it("writes the selection back, mapping the ephemeral row to undefined", async () => {
    const manager = fakeManager();
    const wrapper = mountPicker(manager);
    const rows = wrapper.findAll(".ls-item");
    await rows[2].trigger("click"); // the "b" identity
    expect(manager.select).toHaveBeenLastCalledWith("b");
    await rows[0].trigger("click"); // ephemeral
    expect(manager.select).toHaveBeenLastCalledWith(undefined);
  });

  it("shows the selected identity with its default marker in the trigger", () => {
    const wrapper = mountPicker(fakeManager());
    expect(wrapper.find(".ls-value").text()).toContain("Alpha (default)");
  });

  it("shows the queue position while a mint is waiting", () => {
    const wrapper = mountPicker(fakeManager({ mintState: ref<MintState>({ phase: "queued", ahead: 3 }) }));
    expect(wrapper.text()).toContain("3 ahead of you");
  });

  it("shows the minting hint once work starts", () => {
    const wrapper = mountPicker(fakeManager({ mintState: ref<MintState>({ phase: "minting" }) }));
    expect(wrapper.text()).toContain("Creating identity…");
  });

  it("warns when the gateway reports the selected identity is already live on the target", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, inUse: true }), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    const wrapper = mountPicker(fakeManager(), { target: "voice.example.com:9987" });
    await vi.waitFor(() => expect(wrapper.text()).toContain("already used by another active connection"));
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
