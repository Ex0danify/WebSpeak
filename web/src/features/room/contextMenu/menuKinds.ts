import type { Component } from "vue";
import { channelNameText, nicknameText } from "@/features/session";
import type { ContextKind, ContextTarget } from "@/features/room/contextMenuApi";
import ChannelMenuItems from "@/features/room/contextMenu/ChannelMenuItems.vue";
import MemberMenuItems from "@/features/room/contextMenu/MemberMenuItems.vue";
import SelfMenuItems from "@/features/room/contextMenu/SelfMenuItems.vue";

type Translate = Parameters<typeof nicknameText>[1];

interface MenuKind<K extends ContextKind> {
  /** Rendered inside the shared menu. It receives the payload of its target as props. */
  items: Component;
  /** The menu's accessible name, and the title of the phone sheet. */
  label: (target: Extract<ContextTarget, { kind: K }>, t: Translate) => string;
}

// Adding a menu: its payload in contextMenuApi, an entry here, an items component. The compiler flags a kind without one.
const menuKinds: { [K in ContextKind]: MenuKind<K> } = {
  member: { items: MemberMenuItems, label: ({ member }, t) => nicknameText(member.nickname, t, member.unnamed) },
  self: { items: SelfMenuItems, label: ({ member }, t) => nicknameText(member.nickname, t, member.unnamed) },
  channel: { items: ChannelMenuItems, label: ({ channel }, t) => channelNameText(channel, t) },
};

// One cast: indexing a union of kinds loses which entry belongs to which target.
const entryFor = (target: ContextTarget) => menuKinds[target.kind] as MenuKind<ContextKind>;

export const menuItemsFor = (target: ContextTarget): Component => entryFor(target).items;
export const menuLabelFor = (target: ContextTarget, t: Translate): string => entryFor(target).label(target, t);

/** The target's own data as props for its items component, without the kind and the position. */
export function menuPayloadOf(target: ContextTarget): Record<string, unknown> {
  const { kind: _kind, x: _x, y: _y, ...payload } = target;
  return payload;
}
