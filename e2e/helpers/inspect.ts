import type { Page } from "@playwright/test";

export interface FocusInfo {
  tag: string;
  /** aria-label, text or id of the focused element, cut to 34 characters. */
  label: string;
  outlineWidth: number;
  outlineStyle: string;
  outlineColor: string;
  hasShadow: boolean;
  inDialog: boolean;
}

/** What has focus now and how it shows it, or `"body"` when nothing does. */
export function focusInfo(page: Page): Promise<FocusInfo | "body"> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return "body" as const;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      label: (element.getAttribute("aria-label") || element.textContent || element.id || "").trim().replace(/\s+/g, " ").slice(0, 34),
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      hasShadow: style.boxShadow !== "none",
      inDialog: !!element.closest("[role=dialog]"),
    };
  });
}

/**
 * Text that is cut off (without an ellipsis), or that sits outside the viewport, plus whether the
 * page itself scrolls sideways. Empty `clipped` and `pageScrolls: false` mean nothing overflows.
 */
export function overflowScan(page: Page): Promise<{ clipped: string[]; pageScrolls: boolean }> {
  return page.evaluate(() => {
    const clipped = new Set<string>();
    for (const element of document.querySelectorAll("button,a,span,p,h1,h2,h3,strong,small,label,div,[role=tab]")) {
      if (!(element as HTMLElement).offsetParent || element.children.length) continue;
      // Text kept for screen readers only is drawn in a 1 px box on purpose.
      if (element.clientWidth <= 1 && element.clientHeight <= 1) continue;
      const text = element.textContent?.trim();
      if (!text) continue;
      // A spacer's repeated pattern is cut at the panel edge on purpose.
      if (element.hasAttribute("data-spacer-fill")) continue;
      const style = getComputedStyle(element);
      if (element.scrollWidth > element.clientWidth + 1 && style.textOverflow !== "ellipsis" && style.overflowX !== "visible")
        clipped.add(text.slice(0, 30));
      const box = element.getBoundingClientRect();
      if (box.right > innerWidth + 1 || box.left < -1) clipped.add(`OFFSCREEN:${text.slice(0, 26)}`);
    }
    return { clipped: [...clipped], pageScrolls: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}
