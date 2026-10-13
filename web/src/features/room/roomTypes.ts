import type { useRoomSession } from "./useRoomSession";
import type { ChannelInfo, ChannelMember } from "@/features/session";
import type { Spacer } from "@/shared/lib/parseSpacer";

export interface TreeChannel extends ChannelInfo {
  depth: number;
  members: ChannelMember[];
  /** Set when the name follows the spacer convention: the channel is a layout row and cannot be joined. */
  spacer?: Spacer;
}

type RoomSessionApi = ReturnType<typeof useRoomSession>;

/** What `useRoomSession()` returns: six groups, no flat keys. */
export type RoomSession = RoomSessionApi;
