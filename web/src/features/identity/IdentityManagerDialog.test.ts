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
  const identities: StoredIdentity[] = [{ id: "a", label: "Alpha", privateMaterial: "x", createdAt: 0, lastUsedAt: 0 }];
  return {
    identities: ref(identities),
    selectedId: ref<string | undefined>("a"),
    mintState: ref<MintState>({ phase: "idle" }),
    init: vi.fn(),
    refresh: vi.fn(),
    select: vi.fn(),
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
  it("creates a minted identity with the typed name and announces it", async () => {
    const manager = fakeManager();
    await mountDialog(manager);
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>("#new-identity-name")!;
    input.value = "Work";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    const create = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Create")!;
    create.click();
    await flushPromises();
    expect(manager.create).toHaveBeenCalledWith(expect.objectContaining({ label: "Work" }));
    expect(toast).toHaveBeenCalledWith("Identity created");
  });

  it("maps a mint error code to its message toast", async () => {
    const manager = fakeManager({ create: vi.fn(async () => ({ ok: false, code: "MINT_BUSY" })) });
    await mountDialog(manager);
    await flushPromises();
    [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Create")!.click();
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

  it("warns that an export file is a private key", async () => {
    await mountDialog(fakeManager());
    expect(document.body.textContent).toContain("This file is a private key.");
  });
});
