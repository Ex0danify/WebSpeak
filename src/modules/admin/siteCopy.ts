export type SiteLanguage = "en" | "de";

/** Built-in welcome templates. An empty admin value falls back to these, so a new language never shows a blank welcome. */
export const DEFAULT_WELCOME_TEXTS: Record<SiteLanguage, string> = {
  en: "No TeamSpeak client installation required. Open your browser and join a voice channel with low-latency audio built for conversation.",
  de: "Keine Installation des TeamSpeak-Clients nötig. Öffne den Browser und tritt einem Sprachkanal bei – leichtgewichtig und mit geringer Latenz.",
};

/** Text for every built-in language (admin value, else default) plus any other language the admin stored. */
export function resolveWelcomeTexts(values: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = { ...DEFAULT_WELCOME_TEXTS };
  for (const [language, text] of Object.entries(values)) {
    if (text.trim()) resolved[language] = text.trim();
  }
  return resolved;
}
