import { useI18n } from "@/shared/i18n/useI18n.js";
import { saveLocalPreferences } from "@/shared/services/localPersistence.js";
import { useTheme } from "@/shared/composables/useTheme.js";
import type { ThemeMode } from "@/shared/services/theme.js";

/** Theme cycle and language persistence for the headers of the join page and the room. Wraps `useTheme` and `useI18n` and
 *  mirrors each change into the cross-device local preferences (`saveLocalPreferences`), which `useTheme` deliberately doesn't
 *  know about. `setThemeMode` is returned for callers that restore a theme. */
export function useAppearance() {
  const { language, setLanguage } = useI18n();
  const { themeMode, themeIcon, themeLabel, cycleTheme: cycleThemeBase, selectTheme: selectThemeBase, setThemeMode } = useTheme();

  function persistLanguage() {
    setLanguage(language.value);
    void saveLocalPreferences({ schemaVersion: 1, language: language.value });
  }

  function cycleTheme() {
    cycleThemeBase();
    void saveLocalPreferences({ schemaVersion: 1, theme: themeMode.value });
  }

  function selectTheme(mode: ThemeMode) {
    selectThemeBase(mode);
    void saveLocalPreferences({ schemaVersion: 1, theme: mode });
  }

  return { language, themeMode, themeIcon, themeLabel, cycleTheme, selectTheme, persistLanguage, setThemeMode };
}
