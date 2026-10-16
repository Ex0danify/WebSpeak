import type { useRoomSession } from "./useRoomSession";
import type { ChannelInfo, ChannelMember } from "@/features/session";
import type { Spacer } from "@/shared/lib/parseSpacer";

export interface TreeChannel extends ChannelInfo {
  depth: number;
  members: ChannelMember[];
  /** The top-level channel this one belongs to (its own id for roots and spacers). A root and its subtree form one unit. */
  rootId: string;
  /** Whether no sibling follows it, so its rail ends in an elbow. */
  isLastChild: boolean;
  /** One flag per ancestor between the root and this channel, outermost first: true while that ancestor has a later
   *  sibling and its rail keeps running past this row. Empty for roots and their direct children. */
  ancestorLines: boolean[];
  /** Set when the name follows the spacer convention: the channel is a layout row and cannot be joined. */
  spacer?: Spacer;
}

type RoomSessionApi = ReturnType<typeof useRoomSession>;

/** What `useRoomSession()` returns: six groups, no flat keys. */
export type RoomSession = RoomSessionApi;
