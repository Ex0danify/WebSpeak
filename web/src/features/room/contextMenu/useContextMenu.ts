import { computed, ref } from "vue";
import type { ChannelMember } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes.js";

type Point = { x: number; y: number };

/** What the open menu is about. Another kind of menu is one more member here and one more items component in the layer. */
export type ContextTarget =
  | ({ kind: "member"; member: ChannelMember } & Point)
  | ({ kind: "self"; member: ChannelMember } & Point)
  | ({ kind: "channel"; channel: TreeChannel } & Point);

function pointOf(event: Event): Point {
  return event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : { x: 20, y: 20 };
}

export type MemberMenuState = { member: ChannelMember; x: number; y: number };

/** The room's single context menu (desktop right-click or Shift+F10, mobile long press or "more" action): which target it is
 *  about, where it sits, and focus return on close. `memberMenu` is the member part of it, read and cleared by useChannelTree
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
  // document. Remember the opener's selector and focus that element instead (right click or Shift+F10 both end up there).
  let openerSelector: string | null = null;

  function openMemberMenu(member: ChannelMember, event: Event): void {
    openerSelector = `[data-member-id="${member.id}"]`;
    target.value = { kind: member.isSelf ? "self" : "member", member, ...pointOf(event) };
  }

  function openChannelMenu(channel: TreeChannel, event: Event): void {
    openerSelector = `[data-channel-id="${channel.id.replaceAll(/["\\]/g, String.raw`\$&`)}"]`;
    target.value = { kind: "channel", channel, ...pointOf(event) };
  }

  /** The mobile "more" button, which opens the sheet and is never shown on your own row. */
  function openMemberActions(member: ChannelMember): void {
    if (member.isSelf) return;
    openerSelector = `[data-member-id="${member.id}"]`;
    target.value = { kind: "member", member, x: 0, y: 0 };
  }

  function close(): void {
    target.value = null;
  }

  function onCloseAutoFocus(event: Event): void {
    const selector = openerSelector;
    openerSelector = null;
    if (selector === null) return;
    const opener = document.querySelector<HTMLElement>(selector);
    if (!opener) return;
    event.preventDefault();
    opener.focus();
  }

  return { target, memberMenu, menuStyle, openMemberMenu, openChannelMenu, openMemberActions, close, onCloseAutoFocus };
}
