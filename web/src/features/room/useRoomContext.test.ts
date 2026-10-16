import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { provideRoomSession, useRoomContext } from "@/features/room/useRoomContext";
import type { RoomSession } from "@/features/room/roomTypes";

function mountTree(provided: RoomSession | null) {
  let injected: RoomSession | undefined;
  const Child = defineComponent({
    setup() {
      injected = useRoomContext();
      return () => h("div");
    },
  });
  const Parent = defineComponent({
    setup() {
      if (provided) provideRoomSession(provided);
      return () => h(Child);
    },
  });
  createApp(Parent).mount(document.createElement("div"));
  return injected;
}

describe("useRoomContext", () => {
  it("returns the session a parent provided", () => {
    const session = { session: {}, roster: {}, chat: {}, audio: {}, screenShare: {}, actions: {} } as unknown as RoomSession;
    expect(mountTree(session)).toBe(session);
  });

  it("throws a clear error without a provider", () => {
    expect(() => mountTree(null)).toThrow(/provideRoomSession/);
  });
});
