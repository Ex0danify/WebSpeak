import { inject, provide, type InjectionKey } from "vue";
import type { RoomSession } from "./roomTypes";

const roomSessionKey: InjectionKey<RoomSession> = Symbol("room-session");

export function provideRoomSession(session: RoomSession) {
  provide(roomSessionKey, session);
}

export function useRoomContext(): RoomSession {
  const session = inject(roomSessionKey, null);
  if (!session) throw new Error("[room] useRoomContext() must be called below a component that called provideRoomSession()");
  return session;
}
