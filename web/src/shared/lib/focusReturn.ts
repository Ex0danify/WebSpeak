// A dialog raised from a menu item would hand the focus back to that item, which is gone with the menu. The menu names the
// element that asked for it, and a dialog falls back to that one.
let anchor: HTMLElement | null = null;

export function setFocusReturn(element: HTMLElement | null): void {
  anchor = element;
}

/** The anchor if it is still on the page. It is used up, so a later dialog does not pull the focus to a stale one. */
export function takeFocusReturn(): HTMLElement | null {
  const element = anchor?.isConnected ? anchor : null;
  anchor = null;
  return element;
}
