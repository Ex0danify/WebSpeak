import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "../i18n/use-i18n.js";
import { applyTheme, getStoredTheme, isDarkTheme, nextTheme, saveTheme, watchSystemDark, type ThemeMode } from "../services/theme.js";

/** Theme-cycling state shared by every view with a theme toggle. Wraps `services/theme.ts` and
 *  keeps the operating system's setting reactive so the icon/label follow it while the theme is
 *  System (F26). A caller that also mirrors the theme into its own storage (WebClient's
 *  cross-device local preferences) wraps `cycleTheme`/`setThemeMode` itself; this composable only
 *  owns localStorage persistence via `saveTheme`. */
export function useTheme() {
  const { t } = useI18n();

  const themeMode = ref<ThemeMode>(getStoredTheme());
  const prefersDark = ref(isDarkTheme("system"));
  let stopWatchingSystemDark: (() => void) | null = null;

  const themeIcon = computed(() => (isDarkTheme(themeMode.value, prefersDark.value) ? "sun" : "moon"));
  const themeLabel = computed(() => (isDarkTheme(themeMode.value, prefersDark.value) ? t("switchToLightTheme") : t("switchToDarkTheme")));

  applyTheme(themeMode.value);

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode;
    applyTheme(mode);
  }

  function cycleTheme() {
    themeMode.value = nextTheme(themeMode.value, prefersDark.value);
    saveTheme(themeMode.value);
  }

  onMounted(() => {
    prefersDark.value = isDarkTheme("system");
    stopWatchingSystemDark = watchSystemDark((dark) => {
      prefersDark.value = dark;
    });
  });

  onUnmounted(() => {
    stopWatchingSystemDark?.();
    stopWatchingSystemDark = null;
  });

  return { themeMode, prefersDark, themeIcon, themeLabel, cycleTheme, setThemeMode };
}
