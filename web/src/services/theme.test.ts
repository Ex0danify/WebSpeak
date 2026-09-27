import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "webspeak:theme";

/** The module applies the stored theme when it loads, so each test loads a fresh copy. */
async function load(stored?: string) {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem(KEY, stored);
  vi.resetModules();
  return import("./theme");
}

/** Stand-in for the OS setting, read through matchMedia at call time. */
function osPrefersDark(initial: boolean) {
  const state = { dark: initial };
  const queries: string[] = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    queries.push(query);
    return { matches: state.dark, media: query };
  });
  return { state, queries };
}

/** A localStorage that reads fine and refuses every write, like a full quota. */
function refuseWrites() {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  });
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  osPrefersDark(false);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getStoredTheme", () => {
  it.each(["system", "light", "dark"])("returns the stored value %s", async (value) => {
    const { getStoredTheme } = await load(value);
    expect(getStoredTheme()).toBe(value);
  });

  it("defaults to system when nothing is stored", async () => {
    const { getStoredTheme } = await load();
    expect(getStoredTheme()).toBe("system");
  });

  it.each(["Dark", "auto", "", " dark", "null"])("ignores the invalid stored value '%s'", async (value) => {
    const { getStoredTheme } = await load(value);
    expect(getStoredTheme()).toBe("system");
  });

  it("defaults to system when there is no localStorage", async () => {
    const { getStoredTheme } = await load();
    vi.stubGlobal("localStorage", undefined);
    expect(getStoredTheme()).toBe("system");
  });
});

describe("applying the theme", () => {
  it("sets data-theme on the root element, which the token sheet reads", async () => {
    const { applyTheme } = await load();
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("applies the stored theme when the module loads", async () => {
    await load("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies system when nothing is stored, so the attribute is never missing after load", async () => {
    await load();
    expect(document.documentElement.dataset.theme).toBe("system");
  });

  it("does not touch storage when applying", async () => {
    const { applyTheme } = await load();
    applyTheme("dark");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does nothing without a document", async () => {
    const { applyTheme } = await load();
    vi.stubGlobal("document", undefined);
    expect(() => applyTheme("dark")).not.toThrow();
  });
});

describe("saveTheme", () => {
  it("stores the choice and applies it", async () => {
    const { saveTheme, getStoredTheme } = await load();
    saveTheme("light");
    expect(localStorage.getItem(KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(getStoredTheme()).toBe("light");
  });

  it("survives a reload: the next load applies what was saved", async () => {
    const first = await load();
    first.saveTheme("dark");
    delete document.documentElement.dataset.theme;
    vi.resetModules();
    await import("./theme");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("still applies the theme when there is no localStorage", async () => {
    const { saveTheme } = await load();
    vi.stubGlobal("localStorage", undefined);
    saveTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  // F11: setItem throws when the quota is full, and then the click has no visible effect.
  it.fails("F11: applies the theme even when the browser refuses to store it", async () => {
    const { saveTheme } = await load();
    refuseWrites();
    try {
      saveTheme("dark");
    } catch {
      // The correct behavior is not to throw, but the assertion below is what counts.
    }
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("F11: today a refused write throws and leaves the theme unchanged (pinned)", async () => {
    const { saveTheme } = await load("light");
    refuseWrites();
    expect(() => saveTheme("dark")).toThrow("full");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("isDarkTheme", () => {
  it("is true for dark and false for light, whatever the OS says", async () => {
    const { isDarkTheme } = await load();
    const os = osPrefersDark(false);
    expect(isDarkTheme("dark")).toBe(true);
    os.state.dark = true;
    expect(isDarkTheme("light")).toBe(false);
    expect(os.queries).toEqual([]);
  });

  it("follows the OS live for system", async () => {
    const { isDarkTheme } = await load();
    const os = osPrefersDark(false);
    expect(isDarkTheme("system")).toBe(false);
    os.state.dark = true;
    expect(isDarkTheme("system")).toBe(true);
    os.state.dark = false;
    expect(isDarkTheme("system")).toBe(false);
    expect(new Set(os.queries)).toEqual(new Set(["(prefers-color-scheme: dark)"]));
  });

  it("is false for system when matchMedia is missing", async () => {
    const { isDarkTheme } = await load();
    vi.stubGlobal("matchMedia", undefined);
    expect(isDarkTheme("system")).toBe(false);
  });
});

describe("nextTheme", () => {
  it("flips dark and light", async () => {
    const { nextTheme } = await load();
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });

  it("flips what system currently looks like, and never returns system", async () => {
    const { nextTheme } = await load();
    const os = osPrefersDark(true);
    expect(nextTheme("system")).toBe("light");
    os.state.dark = false;
    expect(nextTheme("system")).toBe("dark");
  });
});
