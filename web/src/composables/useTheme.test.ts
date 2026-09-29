import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "webspeak:theme";

/** Stand-in for the OS setting, read through matchMedia at call time. */
function osPrefersDark(initial: boolean) {
  const state = { dark: initial };
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: state.dark, media: query }));
  return state;
}

/** A media query list that records its listeners and can fire a change, for watchSystemDark. */
function fakeQuery(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: initial,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => query);
  return { listeners, fire: (matches: boolean) => listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent)) };
}

/** Mounts a bare component whose setup is `useTheme()`, for testing the composable
 *  through the real Vue lifecycle (onMounted/onUnmounted) rather than calling it bare. */
async function mountUseTheme() {
  const { useTheme } = await import("./useTheme");
  const wrapper = mount(defineComponent({ setup: () => useTheme(), template: "<div/>" }));
  type Exposed = {
    themeMode: "system" | "light" | "dark";
    prefersDark: boolean;
    themeIcon: string;
    themeLabel: string;
    cycleTheme: () => void;
    setThemeMode: (mode: "system" | "light" | "dark") => void;
  };
  return { wrapper, vm: wrapper.vm as unknown as Exposed };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  osPrefersDark(false);
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("initial state", () => {
  it("starts from the stored theme and applies it", async () => {
    localStorage.setItem(KEY, "dark");
    const { vm } = await mountUseTheme();
    expect(vm.themeMode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("defaults to system when nothing is stored", async () => {
    const { vm } = await mountUseTheme();
    expect(vm.themeMode).toBe("system");
  });

  it("icon and label follow whether the resolved theme is dark", async () => {
    localStorage.setItem(KEY, "dark");
    const { vm } = await mountUseTheme();
    expect(vm.themeIcon).toBe("sun");
    expect(vm.themeLabel).toBe("Switch to light theme");
  });

  it("shows the moon and the dark label when resolved light", async () => {
    localStorage.setItem(KEY, "light");
    const { vm } = await mountUseTheme();
    expect(vm.themeIcon).toBe("moon");
    expect(vm.themeLabel).toBe("Switch to dark theme");
  });
});

describe("cycleTheme", () => {
  it("flips the theme, persists it and applies it", async () => {
    localStorage.setItem(KEY, "light");
    const { vm } = await mountUseTheme();
    vm.cycleTheme();
    expect(vm.themeMode).toBe("dark");
    expect(localStorage.getItem(KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses the live OS setting to decide which way system flips", async () => {
    const os = osPrefersDark(true);
    const { vm } = await mountUseTheme();
    expect(vm.themeMode).toBe("system");
    vm.cycleTheme();
    expect(vm.themeMode).toBe("light");
    os.dark = false;
    vm.cycleTheme();
    expect(vm.themeMode).toBe("dark");
  });
});

describe("setThemeMode", () => {
  it("sets the mode and applies it without touching storage", async () => {
    const { vm } = await mountUseTheme();
    vm.setThemeMode("dark");
    expect(vm.themeMode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("following the operating system while mounted (F26)", () => {
  it("starts watching on mount and updates prefersDark/icon live for system", async () => {
    const os = fakeQuery(false);
    const { vm } = await mountUseTheme();
    expect(vm.prefersDark).toBe(false);
    expect(vm.themeIcon).toBe("moon");
    os.fire(true);
    expect(vm.prefersDark).toBe(true);
    expect(vm.themeIcon).toBe("sun");
  });

  it("stops watching on unmount", async () => {
    const os = fakeQuery(false);
    const { wrapper, vm } = await mountUseTheme();
    wrapper.unmount();
    expect(os.listeners.size).toBe(0);
    os.fire(true);
    expect(vm.prefersDark).toBe(false);
  });

  it("does not affect light/dark, which never read the OS", async () => {
    const os = fakeQuery(false);
    localStorage.setItem(KEY, "dark");
    const { vm } = await mountUseTheme();
    os.fire(true);
    expect(vm.themeMode).toBe("dark");
    expect(vm.themeIcon).toBe("sun");
  });
});
