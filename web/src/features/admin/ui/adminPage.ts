import type { Component } from "vue";

/** The width of a page's content, and of the top bar's controls above it. The page scrolls, nothing in it has a height of its own. */
export const adminContainer = "mx-auto w-full max-w-295 px-6 max-desktop:max-w-175 max-desktop:px-3.5";

/** One card of a page and the class the page gives it (where it sits), so a page can rearrange its cards without touching their markup. */
export interface AdminPageCard {
  id: string;
  component: Component;
  class?: string;
}
