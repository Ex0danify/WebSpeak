import type { InjectionKey, Ref } from "vue";

// Menu renders as a reka-ui popup on desktop and as a bottom sheet at 740 px
// and below. Its parts are different elements in the two modes, so they ask
// the Menu which one they are in.
export interface MenuContext {
  /** True while the menu is drawn as a bottom sheet. */
  sheet: Ref<boolean>;
  /** Closes the menu; used by sheet items after `select`. */
  close: () => void;
}

export const menuContextKey: InjectionKey<MenuContext> = Symbol("ui-menu-context");
