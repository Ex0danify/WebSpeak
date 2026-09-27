import type { Page } from "@playwright/test";

/** An interactive element that is on screen and smaller than the touch target floor. */
export interface SmallTarget {
  /** The accessible name, or the text, cut to 30 characters. */
  label: string;
  tag: string;
  width: number;
  height: number;
}

/** The smallest side of a touch target, in CSS pixels (redesign plan and WCAG 2.5.5). */
export const TOUCH_TARGET = 44;

const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "[role=button]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=switch]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=slider]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Every visible, enabled interactive element with a side under 44 px. Text kept for screen readers
 * (a 1 px box), elements a person cannot reach (hidden, `aria-hidden`, disabled, off the viewport
 * because a panel is closed) and the hidden phone tab bar of a desktop layout are left out.
 */
export function smallTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate(({ selector, floor }) => {
    const found: SmallTarget[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (!element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) continue;
      if ((element as HTMLButtonElement).disabled || element.closest("[aria-hidden=true],[inert]")) continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      if (box.right < 0 || box.left > innerWidth) continue;
      if (box.width >= floor && box.height >= floor) continue;
      // A field is named by its label (a select's text is all its options) and never by a generated
      // id; the rest by their aria-label or text.
      const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? element.labels : null;
      const named = element.getAttribute("aria-label") || labels?.[0]?.textContent || (labels ? "" : element.textContent);
      const label = (named || element.getAttribute("title") || element.id || "").trim().replace(/\s+/g, " ").slice(0, 30);
      found.push({ label, tag: element.tagName.toLowerCase(), width: Math.round(box.width), height: Math.round(box.height) });
    }
    return found;
  }, { selector: INTERACTIVE, floor: TOUCH_TARGET });
}
