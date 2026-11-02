import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, type Ref } from "vue";
import ProfileDialog from "@/features/room/profile/ProfileDialog.vue";
import type { ChannelMember } from "@/features/session";

type Stored = { id: string; label?: string; privateMaterial: string };
const downloadIdentity = vi.hoisted(() => vi.fn());
const importIdentity = vi.hoisted(() => vi.fn());
const rename = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({ list: null as unknown as Ref<Stored[]> }));
vi.mock("@/features/identity", async () => {
  const { ref } = await import("vue");
  store.list = ref<Stored[]>([]);
  return {
    downloadIdentity,
    useIdentityManager: () => ({ identities: store.list, refresh: vi.fn().mockResolvedValue(undefined), importIdentity, rename }),
  };
});

const member: ChannelMember = { id: 7, nickname: "roka", uid: "dWlkLWJhc2U2NA==", isSelf: true };

afterEach(() => {
  document.body.innerHTML = "";
  downloadIdentity.mockReset();
  importIdentity.mockReset();
  rename.mockReset();
  store.list.value = [];
});

async function open(options: { request?: () => Promise<string>; identityMaterial?: string; savedId?: string | null } = {}) {
  const wrapper = mount(ProfileDialog, {
    props: {
      modelValue: true,
      savedId: options.savedId ?? null,
      "onUpdate:savedId": (id: string | null) => void wrapper.setProps({ savedId: id }),
      member,
      identityMaterial: options.identityMaterial ?? "",
      requestIdentity: options.request ?? (() => Promise.resolve("secret-material")),
    },
    attachTo: document.body,
  });
  await nextTick();
  return wrapper;
}

const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
const status = () => document.body.querySelector('[aria-live="polite"]')?.textContent ?? "";

const dialogText = () => document.body.querySelector('[role="dialog"]')?.textContent ?? "";

async function identityTab(): Promise<void> {
  const tab = Array.from(document.body.querySelectorAll('[role="tab"]')).find((el) => el.textContent?.trim() === "Identity");
  tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  await nextTick();
}

async function type(id: string, value: string): Promise<void> {
  const input = document.getElementById(id) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

describe("ProfileDialog", () => {
  it("shows the titled dialog while open and closes with Done", async () => {
    const wrapper = await open();
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Your profile");
    button("Done")?.click();
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it("shows the own name and unique id", async () => {
    const wrapper = await open();
    const text = document.body.textContent ?? "";
    expect(text).toContain("roka");
    expect(text).toContain(member.uid);
    wrapper.unmount();
  });

  it("copies the unique id", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const wrapper = await open();
    button("Copy unique ID")?.click();
    expect(writeText).toHaveBeenCalledWith(member.uid);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});

describe("ProfileDialog identity", () => {
  it("says a temporary identity is temporary and offers the nickname as its name", async () => {
    const wrapper = await open();
    await identityTab();
    expect(status()).toContain("Temporary");
    expect((document.getElementById("profile-identity-name") as HTMLInputElement).value).toBe("roka");
    wrapper.unmount();
  });

  it("saves under the typed name, then shows it as saved and drops the form", async () => {
    importIdentity.mockImplementation(async (privateMaterial: string, label: string) => {
      const identity = { id: "id-1", label, privateMaterial };
      store.list.value = [identity];
      return { ok: true, identity };
    });
    const wrapper = await open();
    await identityTab();
    await type("profile-identity-name", "Laptop");
    button("Save to this device")?.click();
    await flushPromises();
    expect(importIdentity).toHaveBeenCalledWith("secret-material", "Laptop");
    expect(wrapper.emitted("update:savedId")?.at(-1)).toEqual(["id-1"]);
    expect(status()).toContain("Saved on this device");
    expect(dialogText()).toContain("Laptop");
    expect(button("Save to this device")).toBeUndefined();
    wrapper.unmount();
  });

  it("falls back to the nickname when the name is cleared", async () => {
    importIdentity.mockResolvedValue({ ok: true, identity: { id: "id-1", label: "roka", privateMaterial: "secret-material" } });
    const wrapper = await open();
    await identityTab();
    await type("profile-identity-name", "");
    button("Save to this device")?.click();
    await flushPromises();
    expect(importIdentity).toHaveBeenCalledWith("secret-material", "roka");
    wrapper.unmount();
  });

  it("shows a remembered identity as saved without asking the gateway", async () => {
    store.list.value = [{ id: "id-9", label: "Desktop", privateMaterial: "remembered-key" }];
    const request = vi.fn();
    const wrapper = await open({ identityMaterial: "remembered-key", request });
    await identityTab();
    expect(status()).toContain("Saved on this device");
    expect(dialogText()).toContain("Desktop");
    expect(request).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("recognizes a temporary identity that was saved earlier in the session", async () => {
    store.list.value = [{ id: "id-1", label: "Laptop", privateMaterial: "secret-material" }];
    const wrapper = await open({ savedId: "id-1" });
    await identityTab();
    expect(status()).toContain("Saved on this device");
    expect(dialogText()).toContain("Laptop");
    wrapper.unmount();
  });

  it("treats a key that is already stored as saved and does not import it again", async () => {
    store.list.value = [{ id: "id-1", label: "Old", privateMaterial: "secret-material" }];
    const wrapper = await open();
    await identityTab();
    button("Save to this device")?.click();
    await flushPromises();
    expect(importIdentity).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:savedId")?.at(-1)).toEqual(["id-1"]);
    wrapper.unmount();
  });

  it("renames a saved identity inline", async () => {
    store.list.value = [{ id: "id-1", label: "Laptop", privateMaterial: "secret-material" }];
    const wrapper = await open({ savedId: "id-1" });
    await identityTab();
    button("Rename")?.click();
    await nextTick();
    expect((document.getElementById("profile-identity-rename") as HTMLInputElement).value).toBe("Laptop");
    await type("profile-identity-rename", "Work PC");
    button("Save")?.click();
    await flushPromises();
    expect(rename).toHaveBeenCalledWith("id-1", "Work PC");
    expect(document.getElementById("profile-identity-rename")).toBeNull();
    wrapper.unmount();
  });

  it("asks for the key only when exporting, then warns about the private key", async () => {
    const request = vi.fn().mockResolvedValue("secret-material");
    const wrapper = await open({ request });
    await identityTab();
    expect(request).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("private key");
    button("Export")?.click();
    await flushPromises();
    expect(request).toHaveBeenCalledTimes(1);
    expect(downloadIdentity).toHaveBeenCalledWith({ label: "roka", privateMaterial: "secret-material" });
    expect(document.body.textContent).toContain("private key");
    wrapper.unmount();
  });

  it("says so when the key cannot be fetched", async () => {
    const wrapper = await open({ request: () => Promise.reject(new Error("timeout")) });
    await identityTab();
    button("Export")?.click();
    await flushPromises();
    expect(downloadIdentity).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("could not be retrieved or saved");
    wrapper.unmount();
  });
});
