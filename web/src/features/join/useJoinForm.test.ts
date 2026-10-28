import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeVoiceState, mountUseJoinForm, publicConfig, resetJoinFormEnvironment, type Exposed } from "@/testSupport/joinForm";

const dialog = vi.hoisted(() => ({ prompt: vi.fn(), confirm: vi.fn(), alert: vi.fn() }));
vi.mock("@/shared/composables/useDialog", () => ({ useDialog: () => dialog }));

beforeEach(() => {
  resetJoinFormEnvironment();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canJoin", () => {
  it("is false until initialized, even with a nickname", async () => {
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    await flushPromises();
    expect(vm.canJoin).toBe(false);
  });

  it("requires a valid port for a typed address in open mode", async () => {
    publicConfig({ accessMode: "open", servers: [] });
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    vm.serverHost = "example.com";
    vm.serverPort = "not-a-port";
    await flushPromises();
    expect(vm.canJoin).toBe(false);
    vm.serverPort = "9987";
    await flushPromises();
    expect(vm.canJoin).toBe(true);
  });
});

describe("doConnect", () => {
  it("does nothing when canJoin is false", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.doConnect();
    expect(options.connect).not.toHaveBeenCalled();
  });

  it("trims fields and calls connect with the picked server", async () => {
    publicConfig();
    const { vm, options } = await mountUseJoinForm();
    vm.nickname = "  Lucas  ";
    vm.channel = " lobby ";
    await flushPromises();
    vm.doConnect();
    expect(options.clearError).toHaveBeenCalled();
    expect(vm.nickname).toBe("Lucas");
    expect(options.connect).toHaveBeenCalledWith(vm.currentServerTarget(), "lobby", "Lucas", "", "", true, "", false, "", "server-a");
  });

  it("does nothing while already connecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ initialized: true }), { status: 200 })),
    );
    const { vm, options, voiceState } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    voiceState.connecting = true;
    await flushPromises();
    vm.doConnect();
    expect(options.connect).not.toHaveBeenCalled();
  });
});

describe("doDisconnect", () => {
  it("disconnects", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.doDisconnect();
    expect(options.disconnect).toHaveBeenCalled();
  });
});

describe("server password dialog", () => {
  it("submitting sets the password and reconnects", async () => {
    publicConfig();
    const { vm, options } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    vm.serverPasswordDialog.open = true;
    vm.serverPasswordDialog.password = "secret";
    await flushPromises();
    vm.submitServerPassword();
    expect(vm.serverPassword).toBe("secret");
    expect(vm.serverPasswordDialog.open).toBe(false);
    expect(options.connect).toHaveBeenCalled();
  });

  it("does nothing when there is no password to submit", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.serverPasswordDialog.open = true;
    await flushPromises();
    vm.submitServerPassword();
    expect(options.connect).not.toHaveBeenCalled();
  });

  it("cancelling clears the dialog and the gateway error", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.serverPasswordDialog.open = true;
    vm.serverPasswordDialog.password = "secret";
    await flushPromises();
    vm.cancelServerPassword();
    expect(vm.serverPasswordDialog.open).toBe(false);
    expect(vm.serverPasswordDialog.password).toBe("");
    expect(options.clearError).toHaveBeenCalled();
  });
});

describe("selectLocalServer", () => {
  it("fills the target, and the nickname only when empty", async () => {
    const { vm } = await mountUseJoinForm();
    vm.selectLocalServer("voice.example.com:9987", "Saved Nick");
    await flushPromises();
    expect(vm.serverHost).toBe("voice.example.com");
    expect(vm.serverPort).toBe("9987");
    expect(vm.nickname).toBe("Saved Nick");

    vm.selectLocalServer("other.example.com:9988", "Other Nick");
    await flushPromises();
    expect(vm.nickname).toBe("Saved Nick");
  });
});

describe("favorites", () => {
  it("saves then removes the current target", async () => {
    const { vm } = await mountUseJoinForm();
    vm.accessMode = "open";
    vm.serverHost = "voice.example.com";
    vm.serverPort = "9987";
    await flushPromises();
    expect(vm.isFavorite).toBe(false);

    await vm.toggleFavorite();
    await flushPromises();
    expect(vm.isFavorite).toBe(true);
    expect(vm.favoriteServers).toHaveLength(1);

    await vm.toggleFavorite();
    await flushPromises();
    expect(vm.isFavorite).toBe(false);
    expect(vm.favoriteServers).toHaveLength(0);
  });
});

describe("clearBrowserData", () => {
  it("resets identity, remembered flag, favorites and theme after confirming", async () => {
    dialog.confirm.mockResolvedValue(true);
    const { vm, options } = await mountUseJoinForm();
    options.identityMaterial.value = "material";
    vm.rememberIdentity = true;
    await flushPromises();

    await vm.clearBrowserData();

    expect(options.identityMaterial.value).toBe("");
    expect(vm.rememberIdentity).toBe(false);
    expect(vm.favoriteServers).toEqual([]);
    expect(vm.recentServers).toEqual([]);
    expect(options.setThemeMode).toHaveBeenCalledWith("system");
  });

  it("does nothing without confirmation", async () => {
    dialog.confirm.mockResolvedValue(false);
    const { vm, options } = await mountUseJoinForm();
    options.identityMaterial.value = "material";
    await flushPromises();

    await vm.clearBrowserData();

    expect(options.identityMaterial.value).toBe("material");
    expect(options.setThemeMode).not.toHaveBeenCalled();
  });
});

describe("loadPublicConfig (run on mount)", () => {
  it("keeps the form when the config cannot be fetched after the gateway had answered once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ initialized: true }), { status: 200 })),
    );
    const first = await mountUseJoinForm();
    expect(first.vm.initialized).toBe(true);
    first.wrapper.unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { useJoinForm } = await import("@/features/join/useJoinForm");
    const wrapper = mount(
      defineComponent({
        setup: () =>
          useJoinForm({
            voiceState: makeVoiceState(),
            identityMaterial: ref(""),
            selectedIdentityId: ref<string | undefined>(undefined),
            connect: vi.fn(),
            disconnect: vi.fn(),
            clearError: vi.fn(),
            checkSupport: vi.fn(() => null),
            setThemeMode: vi.fn(),
          }),
        template: "<div/>",
      }),
    );
    await flushPromises();
    expect((wrapper.vm as unknown as Exposed).initialized).toBe(true);
  });

  it("says the settings failed to load, not that the gateway is unconfigured, and recovers on a retry", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 502 })),
    );
    const { vm } = await mountUseJoinForm();
    expect(vm.serverConfigFailed).toBe(true);
    expect(vm.initialized).toBe(false);
    expect(vm.serverConfigLoading).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ initialized: false }), { status: 200 })),
    );
    await vm.loadPublicConfig();
    expect(vm.serverConfigFailed).toBe(false);
    expect(vm.initialized).toBe(false);
  });

  it("applies the gateway's public config", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              initialized: true,
              siteName: "Raid Night",
              version: "1.2.3",
              visitorNumber: 42,
              visitorTotal: 100,
              accessMode: "open",
              accelerationRelays: [{ id: "r1", name: "Tokyo" }],
            }),
            { status: 200 },
          ),
      ),
    );
    const { vm } = await mountUseJoinForm();
    expect(vm.initialized).toBe(true);
    expect(vm.serverConfigLoading).toBe(false);
    expect(vm.browserError).toBe("");
  });

  it.each([
    ["an https address", "https://example.org/privacy", "https://example.org/privacy"],
    ["an address with spaces around it", "  http://example.org/p  ", "http://example.org/p"],
    ["a script address, which would run on a click", "javascript:alert(1)", ""],
    ["something that is no address", "privacy", ""],
    ["a value that is no text", 42, ""],
  ])("takes the privacy notice link from %s", async (_name, sent, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ initialized: true, privacyNoticeUrl: sent }), { status: 200 })),
    );
    const { vm } = await mountUseJoinForm();
    expect(vm.privacyNoticeUrl).toBe(expected);
  });

  it("surfaces checkSupport's text as browserError", async () => {
    const { vm } = await mountUseJoinForm({ checkSupport: vi.fn(() => ({ key: "audioDecodingUnsupported" as const })) });
    expect(vm.browserError).toEqual({ key: "audioDecodingUnsupported" });
  });
});
