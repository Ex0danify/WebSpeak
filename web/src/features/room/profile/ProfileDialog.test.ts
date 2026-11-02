import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, type Ref } from "vue";
import ProfileDialog from "@/features/room/profile/ProfileDialog.vue";
import type { ChannelMember } from "@/features/session";
import { fakeConnection } from "@/testSupport/connectionFixture";

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  downloadIdentity.mockReset();
  importIdentity.mockReset();
  rename.mockReset();
  store.list.value = [];
});

async function open(
  options: {
    request?: () => Promise<string>;
    identityMaterial?: string;
    savedId?: string | null;
    changeNickname?: (nickname: string) => Promise<void>;
  } = {},
) {
  const wrapper = mount(ProfileDialog, {
    props: {
      modelValue: true,
      savedId: options.savedId ?? null,
      "onUpdate:savedId": (id: string | null) => void wrapper.setProps({ savedId: id }),
      member,
      identityMaterial: options.identityMaterial ?? "",
      requestIdentity: options.request ?? (() => Promise.resolve("secret-material")),
      changeNickname: options.changeNickname ?? (() => Promise.resolve()),
      connection: fakeConnection() as never,
      screenShareStats: { updatedAt: null, capture: null, peers: [] },
    },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
  await nextTick();
  return wrapper;
}

const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
// Live regions of the dialog, the identity state is the one with the chip.
const status = () =>
  Array.from(document.body.querySelectorAll('[aria-live="polite"]'))
    .map((el) => el.textContent)
    .join(" ");

// What a screen reader is told after a save, the visible hint is aria-hidden.
const savedLive = () => document.body.querySelector('[role="dialog"] .sr-only[aria-live="polite"]')?.textContent ?? "";
const dialogText = () => document.body.querySelector('[role="dialog"]')?.textContent ?? "";

async function type(id: string, value: string): Promise<void> {
  const input = document.getElementById(id) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

describe("ProfileDialog", () => {
  it("shows the titled dialog while open and closes with the close button", async () => {
    const wrapper = await open();
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Your profile");
    expect(button("Done")).toBeUndefined();
    button("Close")?.click();
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it("keeps the own name and the identity state in a header above the tabs, the unique id on the identity tab", async () => {
    const wrapper = await open();
    const header = document.body.querySelector('[role="dialog"] header.sticky')!;
    const identityPanel = document.body.querySelector('[role="tabpanel"]')!;
    expect(header.textContent).toContain("roka");
    expect(header.textContent).toContain("Temporary");
    expect(header.compareDocumentPosition(document.body.querySelector('[role="tablist"]')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(identityPanel.textContent).not.toContain("roka");
    expect(identityPanel.textContent).toContain("Unique ID");
    expect(identityPanel.textContent).toContain(member.uid);
    wrapper.unmount();
  });

  it("shows no unique id line for a member the server gave none", async () => {
    const wrapper = await open();
    await wrapper.setProps({ member: { ...member, uid: undefined } });
    expect(document.body.textContent).not.toContain("Unique ID");
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

describe("ProfileDialog nickname", () => {
  const nicknameInput = () => document.getElementById("profile-nickname") as HTMLInputElement | null;
  const edit = async () => {
    button("Change nickname")?.click();
    await nextTick();
  };

  it("shows the nickname as a label with an edit button, no input yet", async () => {
    const wrapper = await open();
    expect(dialogText()).toContain("roka");
    expect(nicknameInput()).toBeNull();
    expect(button("Change nickname")).toBeDefined();
    wrapper.unmount();
  });

  it("turns into an input with the current name, a save and a cancel button, and keeps save off until it is valid", async () => {
    const wrapper = await open();
    await edit();
    expect(nicknameInput()!.value).toBe("roka");
    expect(button("Change nickname")).toBeUndefined();
    expect((button("Save") as HTMLButtonElement).disabled).toBe(true);
    await type("profile-nickname", "ab");
    expect((button("Save") as HTMLButtonElement).disabled).toBe(true);
    await type("profile-nickname", "Ex0");
    expect((button("Save") as HTMLButtonElement).disabled).toBe(false);
    wrapper.unmount();
  });

  it("counts the characters against the limit of 30 and stops typing there", async () => {
    const wrapper = await open();
    await edit();
    expect(dialogText()).toContain("4/30");
    await type("profile-nickname", "Ex0");
    expect(dialogText()).toContain("3/30");
    expect(nicknameInput()!.getAttribute("maxlength")).toBe("30");
    wrapper.unmount();
  });

  it("names the rules for assistive tech, since the field shows only the counter", async () => {
    const wrapper = await open();
    await edit();
    expect(nicknameInput()!.getAttribute("aria-label")).toBe("Nickname, 3 to 30 characters");
    wrapper.unmount();
  });

  it("marks confirm and cancel by their status color on hover, not by a shape", async () => {
    const wrapper = await open();
    await edit();
    expect(button("Save")!.className).toContain("hover:text-success");
    expect(button("Cancel")!.className).toContain("hover:text-danger");
    expect(button("Save")!.className).not.toMatch(/hover:bg-/);
    expect(button("Cancel")!.className).not.toMatch(/hover:bg-/);
    wrapper.unmount();
  });

  it("puts the cursor in the field, and back on the edit button after cancelling", async () => {
    const wrapper = await open();
    await edit();
    expect(document.activeElement).toBe(nicknameInput());
    button("Cancel")?.click();
    await flushPromises();
    expect(nicknameInput()).toBeNull();
    expect(document.activeElement).toBe(button("Change nickname"));
    expect(dialogText()).toContain("roka");
    wrapper.unmount();
  });

  it("sends the trimmed name, then shows it as the label with the saved hint", async () => {
    const changeNickname = vi.fn().mockResolvedValue(undefined);
    const wrapper = await open({ changeNickname });
    await edit();
    await type("profile-nickname", "  Ex0-web  ");
    button("Save")?.click();
    await flushPromises();
    expect(changeNickname).toHaveBeenCalledWith("Ex0-web");
    expect(nicknameInput()).toBeNull();
    expect(dialogText()).toContain("Ex0-web");
    expect(savedLive()).toBe("Saved");
    const hint = Array.from(document.body.querySelectorAll('[role="dialog"] [aria-hidden="true"]'));
    expect(hint.some((el) => el.textContent?.includes("Saved"))).toBe(true);
    expect(document.activeElement).toBe(button("Change nickname"));
    wrapper.unmount();
  });

  it("renames the saved identity along with the nickname", async () => {
    store.list.value = [{ id: "id-1", label: "Laptop", privateMaterial: "secret-material" }];
    const wrapper = await open({ savedId: "id-1" });
    await edit();
    await type("profile-nickname", "Ex0-web");
    button("Save")?.click();
    await flushPromises();
    expect(rename).toHaveBeenCalledWith("id-1", "Ex0-web");
    wrapper.unmount();
  });

  it("leaves a temporary identity alone when the nickname changes", async () => {
    const wrapper = await open();
    await edit();
    await type("profile-nickname", "Ex0-web");
    button("Save")?.click();
    await flushPromises();
    expect(rename).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("still counts the nickname as saved when the identity label cannot be stored", async () => {
    store.list.value = [{ id: "id-1", label: "Laptop", privateMaterial: "secret-material" }];
    rename.mockRejectedValue(new Error("storage"));
    const wrapper = await open({ savedId: "id-1" });
    await edit();
    await type("profile-nickname", "Ex0-web");
    button("Save")?.click();
    await flushPromises();
    expect(nicknameInput()).toBeNull();
    expect(savedLive()).toBe("Saved");
    wrapper.unmount();
  });

  it("does not leave the pencil's tooltip open when focus returns to it after saving", async () => {
    // The browser's answer for a mouse user: not hovering the pencil, focus not from the keyboard.
    const real = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
      return selector === ":hover" || selector === ":focus-visible" ? false : real.call(this, selector);
    });
    const wrapper = await open();
    await edit();
    await type("profile-nickname", "Ex0-web");
    button("Save")?.click();
    await flushPromises();
    expect(document.activeElement).toBe(button("Change nickname"));
    expect(document.body.textContent).not.toContain("Change nickname");
    wrapper.unmount();
  });

  it("lets the saved hint fade again", async () => {
    const wrapper = await open();
    await edit();
    await type("profile-nickname", "Ex0-web");
    vi.useFakeTimers();
    button("Save")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(savedLive()).toBe("Saved");
    await vi.advanceTimersByTimeAsync(3000);
    expect(savedLive()).toBe("");
    wrapper.unmount();
  });

  it("shows the refusal under the field, stays in edit mode and allows another try", async () => {
    const { LocalizedError, text } = await import("@/shared/i18n/localizedText");
    const changeNickname = vi.fn().mockRejectedValue(new LocalizedError(text("opErr_NICKNAME_IN_USE"), "NICKNAME_IN_USE"));
    const wrapper = await open({ changeNickname });
    await edit();
    await type("profile-nickname", "taken");
    button("Save")?.click();
    await flushPromises();
    expect(dialogText()).toContain("already in use");
    expect(nicknameInput()).not.toBeNull();
    expect(savedLive()).toBe("");
    expect((button("Save") as HTMLButtonElement).disabled).toBe(false);
    await type("profile-nickname", "free");
    expect(dialogText()).not.toContain("already in use");
    wrapper.unmount();
  });

  it("follows a rename that comes from the server", async () => {
    const wrapper = await open();
    await wrapper.setProps({ member: { ...member, nickname: "renamed" } });
    expect(dialogText()).toContain("renamed");
    await edit();
    expect(nicknameInput()!.value).toBe("renamed");
    wrapper.unmount();
  });

  it("starts from the current name again after a cancelled edit", async () => {
    const wrapper = await open();
    await edit();
    await type("profile-nickname", "half-typed");
    button("Cancel")?.click();
    await flushPromises();
    await edit();
    expect(nicknameInput()!.value).toBe("roka");
    wrapper.unmount();
  });
});

describe("ProfileDialog identity", () => {
  it("says a temporary identity is temporary, with no name or field to edit one on the tab", async () => {
    const wrapper = await open();
    expect(status()).toContain("Temporary");
    const identityPanel = document.body.querySelector('[role="tabpanel"]')!;
    expect(identityPanel.querySelector("input")).toBeNull();
    expect(button("Rename")).toBeUndefined();
    expect(dialogText()).not.toContain("…");
    expect(dialogText()).toContain("Save this identity to keep using it on this device.");
    store.list.value = [{ id: "id-1", label: "Laptop", privateMaterial: "secret-material" }];
    await wrapper.setProps({ savedId: "id-1" });
    expect(dialogText()).not.toContain("Save this identity to keep using it");
    wrapper.unmount();
  });

  it("saves under the nickname, then shows it as saved and drops the save button", async () => {
    importIdentity.mockImplementation(async (privateMaterial: string, label: string) => {
      const identity = { id: "id-1", label, privateMaterial };
      store.list.value = [identity];
      return { ok: true, identity };
    });
    const wrapper = await open();
    button("Save to this device")?.click();
    await flushPromises();
    expect(importIdentity).toHaveBeenCalledWith("secret-material", "roka");
    expect(wrapper.emitted("update:savedId")?.at(-1)).toEqual(["id-1"]);
    expect(status()).toContain("Saved on this device");
    expect(button("Save to this device")).toBeUndefined();
    wrapper.unmount();
  });

  it("shows a remembered identity as saved without asking the gateway", async () => {
    store.list.value = [{ id: "id-9", label: "Desktop", privateMaterial: "remembered-key" }];
    const request = vi.fn();
    const wrapper = await open({ identityMaterial: "remembered-key", request });
    expect(status()).toContain("Saved on this device");
    expect(request).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("recognizes a temporary identity that was saved earlier in the session", async () => {
    store.list.value = [{ id: "id-1", label: "Laptop", privateMaterial: "secret-material" }];
    const wrapper = await open({ savedId: "id-1" });
    expect(status()).toContain("Saved on this device");
    wrapper.unmount();
  });

  it("treats a key that is already stored as saved and does not import it again", async () => {
    store.list.value = [{ id: "id-1", label: "Old", privateMaterial: "secret-material" }];
    const wrapper = await open();
    button("Save to this device")?.click();
    await flushPromises();
    expect(importIdentity).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:savedId")?.at(-1)).toEqual(["id-1"]);
    wrapper.unmount();
  });

  it("asks for the key only when exporting, then warns about the private key", async () => {
    const request = vi.fn().mockResolvedValue("secret-material");
    const wrapper = await open({ request });
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
    button("Export")?.click();
    await flushPromises();
    expect(downloadIdentity).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("could not be retrieved or saved");
    wrapper.unmount();
  });
});
