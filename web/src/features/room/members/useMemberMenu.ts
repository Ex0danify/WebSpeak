import { computed, ref } from "vue";
import type { ChannelMember } from "@/features/session";

/** The member context menu (desktop right-click, mobile "more" action) with its position, open state and focus return on close.
 *  `memberMenu` is also read and cleared by useChannelTree and RoomView's chat and viewport handlers, so it stays a plain Ref. */
export function useMemberMenu() {
  const memberMenu = ref<{ member: ChannelMember; x: number; y: number } | null>(null);

  const memberMenuStyle = computed(() => {
    if (!memberMenu.value) return {};
    // #app applies zoom:var(--ui-scale), which also scales fixed-element coordinates against the viewport, so divide the
    // pointer position back to CSS pixels or the menu opens off-target on large displays.
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
    return { left: `${memberMenu.value.x / scale}px`, top: `${memberMenu.value.y / scale}px` };
  });

  // The desktop menu's trigger is a hidden zero-size span that cannot take focus back on close, so Reka leaves it on the
  // document. Remember which member's row opened it and focus that row instead (right click or Shift+F10 both
  // end up there).
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
    const row = document.querySelector<HTMLElement>(`[data-member-id="${id}"]`);
    if (!row) return;
    event.preventDefault();
    row.focus();
  }

  return {
    memberMenu,
    memberMenuStyle,
    openMemberMenu,
    openMemberActions,
    onMemberMenuCloseAutoFocus,
  };
}
