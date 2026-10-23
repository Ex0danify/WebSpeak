import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountUseJoinForm, publicConfig, resetJoinFormEnvironment, SERVERS } from "@/testSupport/joinForm";

vi.mock("@/shared/composables/useDialog", () => ({ useDialog: () => ({ prompt: vi.fn(), confirm: vi.fn(), alert: vi.fn() }) }));

beforeEach(() => {
  resetJoinFormEnvironment();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the server list", () => {
  it("is true once initialized with a nickname in fixed mode, on the first configured server", async () => {
    publicConfig();
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    await flushPromises();
    expect(vm.serverId).toBe("server-a");
    expect(vm.canJoin).toBe(true);
  });

  it("is false in fixed mode when the gateway has no server to offer", async () => {
    publicConfig({ servers: [] });
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    await flushPromises();
    expect(vm.serverId).toBe("");
    expect(vm.canJoin).toBe(false);
  });

  it("needs no address in open mode while a configured server is picked", async () => {
    publicConfig({ accessMode: "open" });
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    vm.serverHost = "";
    await flushPromises();
    expect(vm.canJoin).toBe(true);
    vm.serverId = "";
    await flushPromises();
    expect(vm.canJoin).toBe(false);
  });

  it("connects to a typed address without a server id", async () => {
    publicConfig({ accessMode: "open" });
    const { vm, options } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    vm.serverId = "";
    vm.serverHost = " voice.example.com ";
    vm.serverPort = "9988";
    await flushPromises();
    vm.doConnect();
    expect(options.connect).toHaveBeenCalledWith("voice.example.com:9988", "", "Lucas", "", "", true, "", false, "", "");
  });

  it("reads the configured servers, dropping malformed entries, and ignores a stale pick", async () => {
    publicConfig({ servers: [...SERVERS, { id: 1, name: "x" }, { id: "", name: "y" }, null] });
    const { vm } = await mountUseJoinForm();
    expect(vm.servers).toEqual(SERVERS);
    vm.serverId = "server-gone";
    await vm.loadPublicConfig();
    expect(vm.serverId).toBe("server-a");
    vm.serverId = "server-b";
    await vm.loadPublicConfig();
    expect(vm.serverId).toBe("server-b");
  });

  it("starts on the typed address when the link names one and open access allows it", async () => {
    window.history.replaceState({}, "", "/?server=voice.example.com%3A9988");
    publicConfig({ accessMode: "open" });
    const { vm } = await mountUseJoinForm();
    window.history.replaceState({}, "", "/");
    expect(vm.serverId).toBe("");
    expect(vm.serverHost).toBe("voice.example.com");
  });

  it("ignores an address in the link when access is limited to the list", async () => {
    window.history.replaceState({}, "", "/?server=voice.example.com%3A9988");
    publicConfig();
    const { vm } = await mountUseJoinForm();
    window.history.replaceState({}, "", "/");
    expect(vm.serverId).toBe("server-a");
  });
});
