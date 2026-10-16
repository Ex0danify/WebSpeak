import { readStorage, writeStorage } from "@/shared/services/safeStorage.js";

export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "webspeak:theme";

export function getStoredTheme(): ThemeMode {
  const value = readStorage(THEME_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: ThemeMode): void {
  applyTheme(theme);
  writeStorage(THEME_KEY, theme);
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY).matches : false;
}

/** Whether the theme shows dark. `systemDark` is the operating system's setting when the caller keeps it
 *  reactive (see `watchSystemDark`); without it the setting is read from `matchMedia` at call time. */
export function isDarkTheme(theme: ThemeMode, systemDark?: boolean): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return systemDark ?? systemPrefersDark();
}

export function nextTheme(theme: ThemeMode, systemDark?: boolean): ThemeMode {
  return isDarkTheme(theme, systemDark) ? "light" : "dark";
}

/** Calls `onChange` with the operating system's dark setting each time it changes. Returns the function
 *  that removes the listener (call it when the owner goes away). */
export function watchSystemDark(onChange: (dark: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener?.("change", listener);
  return () => query.removeEventListener?.("change", listener);
}

applyTheme(getStoredTheme());
