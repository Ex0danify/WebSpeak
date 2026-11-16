import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import { useSessionStore, type ChannelMember, type ServerGroup } from "@/features/session";
import { useModeration } from "@/features/room/moderation/useModeration";

const dialog = vi.hoisted(() => ({ prompt: vi.fn(), confirm: vi.fn(), alert: vi.fn() }));
vi.mock("@/shared/composables/useDialog", () => ({ useDialog: () => dialog }));

const ana = { id: 2, nickname: "Ana", serverGroups: [6] } as ChannelMember;
const group = (id: number, name: string, extra: Partial<ServerGroup> = {}): ServerGroup => ({
  id,
  name,
  iconId: 0,
  isDefault: false,
  type: 1,
  ...extra,
});

const refused = async () => {
  throw new LocalizedError(text("err_PERMISSION_DENIED"), "PERMISSION_DENIED");
};

function setup(overrides: Partial<Parameters<typeof useModeration>[0]["actions"]> = {}) {
  const actions = {
    kickClient: vi.fn(async () => undefined),
    banClient: vi.fn(async () => undefined),
    setServerGroup: vi.fn(async () => undefined),
    setChannelGroup: vi.fn(async () => undefined),
    ...overrides,
  };
  return { actions, moderation: useModeration({ actions }) };
}

const lastToast = () => useToast().toasts.value.at(-1);

beforeEach(() => {
  setActivePinia(createPinia());
  useToast().dismiss();
  dialog.prompt.mockReset().mockResolvedValue("calm down");
});

describe("kickMember", () => {
  it("asks for a reason, kicks with the scope and toasts success", async () => {
    const { actions, moderation } = setup();
    await moderation.kickMember(ana, "channel");
    expect(dialog.prompt).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Ana") }));
    expect(actions.kickClient).toHaveBeenCalledWith(2, "channel", "calm down");
    expect(lastToast()).toMatchObject({ variant: "success" });
    await moderation.kickMember(ana, "server");
    expect(actions.kickClient).toHaveBeenLastCalledWith(2, "server", "calm down");
  });

  it("does nothing when the prompt is cancelled, and kicks without a reason when it is left empty", async () => {
    const { actions, moderation } = setup();
    dialog.prompt.mockResolvedValue(null);
    await moderation.kickMember(ana, "server");
    expect(actions.kickClient).not.toHaveBeenCalled();
    dialog.prompt.mockResolvedValue("");
    await moderation.kickMember(ana, "server");
    expect(actions.kickClient).toHaveBeenCalledWith(2, "server", "");
  });

  it("toasts the refusal, with the permission it lacked, and no success", async () => {
    const { moderation } = setup({ kickClient: refused });
    await moderation.kickMember(ana, "server");
    expect(useToast().toasts.value).toHaveLength(1);
    expect(lastToast()).toMatchObject({ variant: "danger" });
  });
});

describe("banMember", () => {
  it("opens the dialog for the member, and the confirmation bans with the length and reason and closes it", async () => {
    const { actions, moderation } = setup();
    moderation.banMember(ana);
    expect(moderation.banDialog).toMatchObject({ open: true, member: ana });
    await moderation.confirmBan(3600, "spam");
    expect(actions.banClient).toHaveBeenCalledWith(2, 3600, "spam");
    expect(moderation.banDialog.open).toBe(false);
    expect(lastToast()).toMatchObject({ variant: "success" });
  });

  it("toasts the refusal of a ban", async () => {
    const { moderation } = setup({ banClient: refused });
    moderation.banMember(ana);
    await moderation.confirmBan(0, "");
    expect(lastToast()).toMatchObject({ variant: "danger" });
  });

  it("bans nobody when no member is set", async () => {
    const { actions, moderation } = setup();
    await moderation.confirmBan(0, "");
    expect(actions.banClient).not.toHaveBeenCalled();
  });
});

describe("groups", () => {
  it("gives a server group the member does not have, and takes one they do", async () => {
    const { actions, moderation } = setup();
    await moderation.toggleServerGroup(ana, group(7, "Normal"));
    expect(actions.setServerGroup).toHaveBeenLastCalledWith(2, 7, true);
    await moderation.toggleServerGroup(ana, group(6, "Admin"));
    expect(actions.setServerGroup).toHaveBeenLastCalledWith(2, 6, false);
  });

  it("treats a member without groups as having none", async () => {
    const { actions, moderation } = setup();
    await moderation.toggleServerGroup({ id: 3, nickname: "Bo" } as ChannelMember, group(6, "Admin"));
    expect(actions.setServerGroup).toHaveBeenCalledWith(3, 6, true);
  });

  it("sets a channel group", async () => {
    const { actions, moderation } = setup();
    await moderation.assignChannelGroup(ana, group(5, "Mod"));
    expect(actions.setChannelGroup).toHaveBeenCalledWith(2, 5);
    expect(lastToast()).toMatchObject({ variant: "success" });
  });

  it("takes a channel group away by giving the default one, when the member already has the group", async () => {
    useSessionStore().channelGroups = [group(5, "Mod"), group(9, "Guest", { isDefault: true })];
    const { actions, moderation } = setup();
    await moderation.assignChannelGroup({ ...ana, channelGroupId: 5 }, group(5, "Mod"));
    expect(actions.setChannelGroup).toHaveBeenCalledWith(2, 9);
    expect(lastToast()?.title).toContain("Guest");
  });

  it("cannot take it away without knowing the default group, and sends nothing", async () => {
    const { actions, moderation } = setup();
    await moderation.assignChannelGroup({ ...ana, channelGroupId: 5 }, group(5, "Mod"));
    expect(actions.setChannelGroup).not.toHaveBeenCalled();
  });

  it("toasts the refusal of a group change", async () => {
    const { moderation } = setup({ setServerGroup: refused, setChannelGroup: refused });
    await moderation.toggleServerGroup(ana, group(7, "Normal"));
    await moderation.assignChannelGroup(ana, group(5, "Mod"));
    expect(useToast().toasts.value.map((toast) => toast.variant)).toEqual(["danger", "danger"]);
  });
});
