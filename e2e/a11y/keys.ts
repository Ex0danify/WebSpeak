import type { Page } from "@playwright/test";

/** One place the Tab key stopped, and how it shows that it has focus. */
export interface Stop {
  /** Counts elements in the order they were first reached, so two buttons with one name differ. */
  id: number;
  tag: string;
  label: string;
  /** How the focus shows: a visible outline, a box shadow that the focus adds, or nothing. */
  ring: "outline" | "shadow" | "none";
  outlineWidth: number;
  inDialog: boolean;
}

/**
 * Describes the focused element, or returns `null` when the document has the focus. A box shadow is
 * a ring when one of its layers has no offset and a spread of 2 px or more (`0 0 0 3px accent`), so a
 * resting shadow (a slider thumb, an input) does not count. The element is not blurred to compare:
 * that would run the page's own focus handlers (the dock's panels open and close on focus).
 */
export function describeFocus(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;
    const book = ((window as unknown as { __stops?: { ids: WeakMap<Element, number>; last: number } }).__stops ??= { ids: new WeakMap(), last: 0 });
    if (!book.ids.has(element)) book.ids.set(element, ++book.last);
    const style = getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
    // The browser's own ring (outline-style: auto) has no width to read.
    const outline = style.outlineStyle !== "none" && (outlineWidth >= 2 || style.outlineStyle === "auto");
    // Computed shadows read "rgb(0, 0, 0) 0px 0px 0px 3px": colour, x, y, blur, spread.
    const shadow = /0px 0px (?:\d+(?:\.\d+)?px )?(?:[2-9]|\d{2,})(?:\.\d+)?px(?:,|$)/.test(style.boxShadow.replace(/ inset/g, ""));
    return {
      id: book.ids.get(element)!,
      tag: element.tagName.toLowerCase(),
      label: (element.getAttribute("aria-label") || element.textContent || element.id || "").trim().replace(/\s+/g, " ").slice(0, 34),
      ring: outline ? ("outline" as const) : shadow ? ("shadow" as const) : ("none" as const),
      outlineWidth,
      inDialog: !!element.closest("[role=dialog]"),
    };
  });
}

/**
 * Presses Tab until the first stop comes round again and returns the stops of one round, and how
 * many presses left the focus on the document itself. A round has one of those, the wrap through
 * the browser's own controls; more than one is a Tab press that lands on nothing. `closed` is false
 * when no round closes within `max` presses, which is what a keyboard trap looks like.
 */
export async function tabRound(page: Page, max = 80): Promise<{ stops: Stop[]; gaps: number; closed: boolean }> {
  // Start from the top of the document, like a person who has just loaded the page.
  await page.mouse.click(1, 1);
  const stops: Stop[] = [];
  let gaps = 0;
  for (let press = 0; press < max; press++) {
    await page.keyboard.press("Tab");
    const stop = await describeFocus(page);
    if (!stop) {
      if (stops.length) gaps++;
      continue;
    }
    if (stops.length && stop.id === stops[0]!.id) return { stops, gaps, closed: true };
    stops.push(stop);
  }
  return { stops, gaps, closed: false };
}
