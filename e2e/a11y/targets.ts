import type { Page } from "@playwright/test";

/** An interactive element that is on screen and smaller than the touch target floor. */
export interface SmallTarget {
  /** The accessible name, or the text, cut to 30 characters. */
  label: string;
  tag: string;
  width: number;
  height: number;
}

/** The smallest side of a touch target, in CSS pixels (WCAG 2.5.5). */
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
 * Every visible, enabled interactive element with a side under 44 px. Left out are text kept for screen readers (a 1 px box),
 * elements a person cannot reach (hidden, `aria-hidden`, disabled, off the viewport) and the phone tab bar hidden on desktop.
 */
export function smallTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate(
    ({ selector, floor }) => {
      const found: SmallTarget[] = [];
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        if (!element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) continue;
        if ((element as HTMLButtonElement).disabled || element.closest("[aria-hidden=true],[inert]")) continue;
        const box = element.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) continue;
        if (box.right < 0 || box.left > innerWidth) continue;
        // A control may keep its look and take the tap on a larger invisible area (an absolutely positioned ::after).
        const hit = getComputedStyle(element, "::after");
        const hitWidth = hit.position === "absolute" ? Number.parseFloat(hit.width) || 0 : 0;
        const hitHeight = hit.position === "absolute" ? Number.parseFloat(hit.height) || 0 : 0;
        const width = Math.max(box.width, hitWidth);
        const height = Math.max(box.height, hitHeight);
        if (width >= floor && height >= floor) continue;
        // A field is named by its label (a select's text is all its options) and never by a generated id,
        // the rest by their aria-label or text.
        const labels =
          element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
            ? element.labels
            : null;
        const named = element.getAttribute("aria-label") || labels?.[0]?.textContent || (labels ? "" : element.textContent);
        const label = (named || element.getAttribute("title") || element.id || "").trim().replace(/\s+/g, " ").slice(0, 30);
        found.push({ label, tag: element.tagName.toLowerCase(), width: Math.round(width), height: Math.round(height) });
      }
      return found;
    },
    { selector: INTERACTIVE, floor: TOUCH_TARGET },
  );
}
