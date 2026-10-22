import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import IdentityManagerDialog from "@/features/identity/IdentityManagerDialog.vue";
import type { MintState, useIdentityManager } from "@/features/identity/useIdentityManager";
import type { StoredIdentity } from "@/shared/services/localPersistence";

const toast = vi.fn();
vi.mock("@/shared/composables/useToast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

type Manager = ReturnType<typeof useIdentityManager>;

function fakeManager(overrides: Partial<Record<keyof Manager, unknown>> = {}): Manager {
  const identities: StoredIdentity[] = [
    { id: "a", label: "Alpha", privateMaterial: "x", createdAt: 0, lastUsedAt: 0 },
    { id: "b", label: "Beta", privateMaterial: "y", createdAt: 0, lastUsedAt: 0 },
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
    create: vi.fn(async () => ({ ok: true, identity: identities[0] })),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    exportIdentity: vi.fn(() => ({ label: "Alpha", privateMaterial: "x" })),
    importIdentity: vi.fn(async () => ({ ok: true, identity: identities[0] })),
    ...overrides,
  } as unknown as Manager;
}

async function mountDialog(manager: Manager) {
  const wrapper = mount(IdentityManagerDialog, {
    props: { modelValue: true, "onUpdate:modelValue": () => {}, manager },
    attachTo: document.body,
  });
  await flushPromises(); // reka portals the dialog content on open
  return wrapper;
}

afterEach(() => {
  toast.mockClear();
  document.body.innerHTML = "";
});

describe("IdentityManagerDialog", () => {
  const clickButton = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;

  it("opens the create form only behind the add button, then returns to the store", async () => {
    const manager = fakeManager();
    await mountDialog(manager);
    expect(document.querySelector("#new-identity-name")).toBeNull();
    clickButton("Add identity").click();
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>("#new-identity-name")!;
    input.value = "Work";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    clickButton("Create").click();
    await flushPromises();
    expect(manager.create).toHaveBeenCalledWith(expect.objectContaining({ label: "Work" }));
    expect(toast).toHaveBeenCalledWith("Identity created");
    // Back on the store list, the create form is gone.
    expect(document.querySelector("#new-identity-name")).toBeNull();
    expect(clickButton("Add identity")).toBeDefined();
  });

  it("cancelling the create form returns to the store without creating", async () => {
    const manager = fakeManager();
    await mountDialog(manager);
    clickButton("Add identity").click();
    await flushPromises();
    clickButton("Cancel").click();
    await flushPromises();
    expect(manager.create).not.toHaveBeenCalled();
    expect(document.querySelector("#new-identity-name")).toBeNull();
  });

  it("maps a mint error code to its message toast", async () => {
    const manager = fakeManager({ create: vi.fn(async () => ({ ok: false, code: "MINT_BUSY" })) });
    await mountDialog(manager);
    clickButton("Add identity").click();
    await flushPromises();
    clickButton("Create").click();
    await flushPromises();
    expect(toast).toHaveBeenCalledWith({ title: "The identity service is busy. Try again in a moment.", variant: "danger" });
  });

  it("rejects an invalid import file without storing it", async () => {
    const manager = fakeManager();
    await mountDialog(manager);
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { value: [new File(["not json"], "bad.json")], configurable: true });
    fileInput.dispatchEvent(new Event("change"));
    await flushPromises();
    expect(manager.importIdentity).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("That file is not a valid identity.");
  });

  it("imports a valid identity file", async () => {
    const manager = fakeManager();
    await mountDialog(manager);
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const payload = JSON.stringify({ label: "Imported", privateMaterial: "zzz" });
    Object.defineProperty(fileInput, "files", { value: [new File([payload], "good.json")], configurable: true });
    fileInput.dispatchEvent(new Event("change"));
    await flushPromises();
    expect(manager.importIdentity).toHaveBeenCalledWith("zzz", "Imported");
    expect(toast).toHaveBeenCalledWith("Identity imported");
  });

  it("confirms before deleting", async () => {
    const manager = fakeManager();
    await mountDialog(manager);
    const del = () => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Delete")!;
    del().click();
    await flushPromises();
    expect(manager.remove).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Delete this identity?");
    del().click();
    await flushPromises();
    expect(manager.remove).toHaveBeenCalledWith("a");
    expect(toast).toHaveBeenCalledWith("Identity deleted");
  });

  it("marks the default with a pressed star and switches the default when another star is clicked", async () => {
    const manager = fakeManager();
    await mountDialog(manager);
    const starFor = (label: string) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label)!;
    expect(starFor("Default identity").getAttribute("aria-pressed")).toBe("true");
    const makeDefault = starFor("Set as default identity");
    expect(makeDefault.getAttribute("aria-pressed")).toBe("false");
    makeDefault.click();
    await flushPromises();
    expect(manager.setDefault).toHaveBeenCalledWith("b");
  });

  it("shows the private-key warning only after something is exported", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const wrapper = await mountDialog(fakeManager());
    expect(document.body.textContent).not.toContain("This file is a private key.");
    clickButton("Export").click();
    await flushPromises();
    expect(document.body.textContent).toContain("This file is a private key.");

    // Closing and reopening the manager clears the warning again.
    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    expect(document.body.textContent).not.toContain("This file is a private key.");
  });
});
