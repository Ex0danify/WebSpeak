export type SiteLanguage = "en" | "de";

/**
 * Built-in welcome-page templates. An empty administrator value always falls
 * back to one of these strings, so adding a language never leaves the page
 * with a blank welcome message.
 */
export const DEFAULT_WELCOME_TEXTS: Record<SiteLanguage, string> = {
  en: "No TeamSpeak client installation required. Open your browser and join a voice channel with low-latency audio built for conversation.",
  de: "Keine Installation des TeamSpeak-Clients nötig. Öffne den Browser und tritt einem Sprachkanal bei – leichtgewichtig und mit geringer Latenz.",
};

/**
 * The text for every built-in language (the administrator's value, else the default) plus any
 * other language the administrator stored a text for.
 */
export function resolveWelcomeTexts(values: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = { ...DEFAULT_WELCOME_TEXTS };
  for (const [language, text] of Object.entries(values)) {
    if (text.trim()) resolved[language] = text.trim();
  }
  return resolved;
}
