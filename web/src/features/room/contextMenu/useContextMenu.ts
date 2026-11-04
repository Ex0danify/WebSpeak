import { computed, ref } from "vue";
import type { ChannelMember } from "@/features/session";
import type { ContextKind, ContextOrigin, ContextPayloads, ContextTarget } from "@/features/room/contextMenuApi";

export type MemberMenuState = { member: ChannelMember; x: number; y: number };

function pointOf(origin: ContextOrigin): { x: number; y: number } {
  if (origin instanceof MouseEvent) return { x: origin.clientX, y: origin.clientY };
  return origin instanceof Event ? { x: 20, y: 20 } : { x: 0, y: 0 };
}

/** The room's single context menu (desktop right-click or Shift+F10, mobile long press or "more" action): which target it is
 *  about, where it sits, and focus return on close. Another menu is a payload in contextMenuApi, an items component and an
 *  entry in menuKinds, and `open()` from the element. `memberMenu` is the member part of it, read and cleared by useChannelTree
 *  and RoomView's chat and viewport handlers; clearing it closes whatever menu is open. */
export function useContextMenu() {
  const target = ref<ContextTarget | null>(null);

  const memberMenu = computed<MemberMenuState | null>({
    get: () => (target.value?.kind === "member" ? { member: target.value.member, x: target.value.x, y: target.value.y } : null),
    set: (value) => {
      target.value = value ? { kind: "member", ...value } : null;
    },
  });

  const menuStyle = computed(() => {
    if (!target.value) return {};
    // #app applies zoom:var(--ui-scale), which also scales fixed-element coordinates against the viewport, so divide the
    // pointer position back to CSS pixels or the menu opens off-target on large displays.
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
    return { left: `${target.value.x / scale}px`, top: `${target.value.y / scale}px` };
  });

  // The desktop menu's trigger is a hidden zero-size span that cannot take focus back on close, so Reka leaves it on the
  // document. Remember the element that asked for the menu and focus that instead (right click or Shift+F10 both end up there).
  let opener: HTMLElement | null = null;

  function open<K extends ContextKind>(kind: K, payload: ContextPayloads[K], origin: ContextOrigin): void {
    const element = origin instanceof Event ? origin.currentTarget : origin;
    opener = element instanceof HTMLElement ? element : null;
    target.value = { kind, ...payload, ...pointOf(origin) } as ContextTarget;
  }

  function close(): void {
    target.value = null;
  }

  function onCloseAutoFocus(event: Event): void {
    const element = opener;
    opener = null;
    if (!element?.isConnected) return;
    event.preventDefault();
    element.focus();
  }

  return { target, memberMenu, menuStyle, open, close, onCloseAutoFocus };
}
