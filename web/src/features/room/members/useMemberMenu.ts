import { computed, ref } from "vue";
import type { ChannelMember } from "@/features/session";

/** The member context menu (desktop right-click / mobile "more" action): its position, open/close
 *  state, and the F34/F47 focus-return behavior when it closes. `memberMenu` itself is also read
 *  and cleared by useChannelTree (the move-to-channel submenu) and by RoomView's own chat and
 *  viewport handlers, so it stays exposed as a plain Ref rather than hidden behind actions only. */
export function useMemberMenu() {
  const memberMenu = ref<{ member: ChannelMember; x: number; y: number } | null>(null);

  const memberMenuStyle = computed(() => {
    if (!memberMenu.value) return {};
    // #app applies zoom:var(--ui-scale) which also scales fixed-element
    // coordinates against the viewport; divide the pointer position back to CSS
    // pixels so the context menu opens exactly where the user clicked on large
    // displays.
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
    return { left: `${memberMenu.value.x / scale}px`, top: `${memberMenu.value.y / scale}px` };
  });

  // The desktop menu's trigger is a hidden zero-size span placed at the click point (F34), which
  // cannot take the keyboard focus back when the menu closes: Reka's default then leaves the focus
  // on the document. Remember which member's row opened it and, on close, give the focus to that
  // row's own volume slider instead (F47); it exists for every row a menu can open on, whether the
  // menu was opened with a right click or with Shift+F10 on the slider itself.
  let memberMenuOpenerId: number | null = null;

  function openMemberMenu(member: ChannelMember, event: Event): void {
    if (member.isSelf) return;
    const point = event instanceof MouseEvent ? event : undefined;
    memberMenuOpenerId = member.id;
    memberMenu.value = { member, x: point?.clientX ?? 20, y: point?.clientY ?? 20 };
  }

  function openMemberActions(member: ChannelMember): void {
    if (member.isSelf) return;
    memberMenuOpenerId = member.id;
    memberMenu.value = { member, x: 0, y: 0 };
  }

  function onMemberMenuCloseAutoFocus(event: Event): void {
    const id = memberMenuOpenerId;
    memberMenuOpenerId = null;
    if (id === null) return;
    const slider = document.querySelector<HTMLElement>(`.member-volume[data-member-id="${id}"] [role="slider"]`);
    if (!slider) return;
    event.preventDefault();
    slider.focus();
  }

  return {
    memberMenu,
    memberMenuStyle,
    openMemberMenu,
    openMemberActions,
    onMemberMenuCloseAutoFocus,
  };
}
