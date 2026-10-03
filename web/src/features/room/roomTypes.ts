import type { useRoomSession } from "./useRoomSession";
import type { ChannelInfo, ChannelMember } from "@/features/session";

export interface TreeChannel extends ChannelInfo {
  depth: number;
  members: ChannelMember[];
}

type RoomSessionApi = ReturnType<typeof useRoomSession>;

/** What `useRoomSession()` returns: six groups, no flat keys. */
export type RoomSession = RoomSessionApi;
