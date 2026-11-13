import { inject, provide, type InjectionKey, type Ref } from "vue";
import type { ChannelMember } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes";

// What a room element needs to open a context menu and what the menu needs to act. It lives at the room root because the
// sub-features (members, chat, ...) may not import each other, and both sides provide or inject through here.

/** Every kind of context menu and what it is about. A new menu starts with one line here. */
export interface ContextPayloads {
  member: { member: ChannelMember };
  self: { member: ChannelMember };
  channel: { channel: TreeChannel };
}
export type ContextKind = keyof ContextPayloads;
export type ContextTarget = { [K in ContextKind]: { kind: K } & ContextPayloads[K] & { x: number; y: number } }[ContextKind];

/** The event that asked for the menu (it gives the position and the element to refocus), or an element to anchor to when
 *  there is no pointer, like a "more" button. */
export type ContextOrigin = Event | HTMLElement;
export type OpenContextMenu = <K extends ContextKind>(kind: K, payload: ContextPayloads[K], origin: ContextOrigin) => void;

const openKey: InjectionKey<OpenContextMenu> = Symbol("room-context-menu");

export function provideContextMenu(open: OpenContextMenu) {
  provide(openKey, open);
}

/** For any element in the room: `@contextmenu.prevent="open('channel', { channel }, $event)"`. Outside the room (an isolated
 *  component test) there is no menu and opening does nothing. */
export function useContextMenuOpener(): OpenContextMenu {
  return inject(openKey, () => {});
}

/** What the menus can do. RoomView provides it from the room's composables, so a menu item calls an action instead of
 *  every new item adding a prop and an event along the way. */
export interface ContextMenuActions {
  currentChannelId: Readonly<Ref<string | undefined>>;
  moveCurrentChannel: Readonly<Ref<TreeChannel | null>>;
  moveCurrentSameChannel: Readonly<Ref<boolean>>;
  moveOtherChannels: Readonly<Ref<TreeChannel[]>>;
  openPrivateChat: (memberId: number) => void;
  pokeMember: (member: ChannelMember) => void | Promise<void>;
  toggleWhisperTarget: (member: ChannelMember) => void | Promise<void>;
  copyMemberName: (member: ChannelMember) => void;
  moveMemberDirect: (member: ChannelMember, channelId: string) => void | Promise<void>;
  switchChannel: (channel: TreeChannel) => void;
  copyChannelName: (channel: TreeChannel) => void;
}

const actionsKey: InjectionKey<ContextMenuActions> = Symbol("room-context-actions");

export function provideContextActions(actions: ContextMenuActions) {
  provide(actionsKey, actions);
}

export function useContextActions(): ContextMenuActions {
  const actions = inject(actionsKey, null);
  if (!actions) throw new Error("[room] useContextActions() must be called below a component that called provideContextActions()");
  return actions;
}
