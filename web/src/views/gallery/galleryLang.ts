import { inject, type InjectionKey, type Ref } from "vue";

export type Lang = "en" | "de" | "ru";

/** The gallery's language switcher, provided by `UiGallery.vue` and read by every section. */
export const langKey: InjectionKey<Ref<Lang>> = Symbol("galleryLang");

export function useGalleryLang(): Ref<Lang> {
  const lang = inject(langKey);
  if (!lang) throw new Error("A gallery section needs UiGallery.vue to provide the language");
  return lang;
}

/** The close button label of every dialog and menu sheet in the gallery. */
export const closeLabel: Record<Lang, string> = { en: "Close", de: "Schließen", ru: "Закрыть" };
