import { useI18n } from "../i18n/useI18n.js";
import { saveLocalPreferences } from "../services/localPersistence.js";
import { useTheme } from "./useTheme.js";

/** Theme cycle and language persistence for the headers of the join page and the room. Wraps `useTheme` and `useI18n` and
 *  mirrors each change into the cross-device local preferences (`saveLocalPreferences`), which `useTheme` deliberately doesn't
 *  know about. `setThemeMode` is returned for callers that restore a theme. */
export function useAppearance() {
  const { language, setLanguage } = useI18n();
  const { themeMode, themeIcon, themeLabel, cycleTheme: cycleThemeBase, setThemeMode } = useTheme();

  function persistLanguage() {
    setLanguage(language.value);
    void saveLocalPreferences({ schemaVersion: 1, language: language.value });
  }

  function cycleTheme() {
    cycleThemeBase();
    void saveLocalPreferences({ schemaVersion: 1, theme: themeMode.value });
  }

  return { language, themeIcon, themeLabel, cycleTheme, persistLanguage, setThemeMode };
}
