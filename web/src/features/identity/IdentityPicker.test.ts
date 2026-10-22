import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import IdentityPicker from "@/features/identity/IdentityPicker.vue";
import type { MintState, useIdentityManager } from "@/features/identity/useIdentityManager";
import type { StoredIdentity } from "@/shared/services/localPersistence";

type Manager = ReturnType<typeof useIdentityManager>;

function fakeManager(overrides: Partial<Record<keyof Manager, unknown>> = {}): Manager {
  const identities: StoredIdentity[] = [
    { id: "a", label: "Alpha", privateMaterial: "x", createdAt: 0, lastUsedAt: 0 },
    { id: "b", label: "", privateMaterial: "y", createdAt: 0, lastUsedAt: 0 },
  ];
  return {
    identities: ref(identities),
    selectedId: ref<string | undefined>("a"),
    mintState: ref<MintState>({ phase: "idle" }),
    init: vi.fn(),
    refresh: vi.fn(),
    select: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    exportIdentity: vi.fn(),
    importIdentity: vi.fn(),
    ...overrides,
  } as unknown as Manager;
}

describe("IdentityPicker", () => {
  it("lists saved identities, the unnamed fallback and an ephemeral option", () => {
    const wrapper = mount(IdentityPicker, { props: { manager: fakeManager() } });
    const options = wrapper.findAll("option").map((o) => o.text());
    expect(options).toEqual(["Ephemeral — don't save", "Alpha", "Unnamed identity"]);
  });

  it("writes the selection back, mapping the ephemeral option to undefined", async () => {
    const manager = fakeManager();
    const wrapper = mount(IdentityPicker, { props: { manager } });
    await wrapper.find("select").setValue("b");
    expect(manager.select).toHaveBeenLastCalledWith("b");
    await wrapper.find("select").setValue("");
    expect(manager.select).toHaveBeenLastCalledWith(undefined);
  });

  it("shows the queue position while a mint is waiting", () => {
    const manager = fakeManager({ mintState: ref<MintState>({ phase: "queued", ahead: 3 }) });
    const wrapper = mount(IdentityPicker, { props: { manager } });
    expect(wrapper.text()).toContain("3 ahead of you");
  });

  it("shows the minting hint once work starts", () => {
    const manager = fakeManager({ mintState: ref<MintState>({ phase: "minting" }) });
    const wrapper = mount(IdentityPicker, { props: { manager } });
    expect(wrapper.text()).toContain("Creating identity…");
  });
});
