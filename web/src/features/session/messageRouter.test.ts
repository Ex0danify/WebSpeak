// The dispatcher and the roster/chat handlers. The per-module handlers are covered by their
// modules' tests and by messages.*.test.ts, which drive every type through the whole composable.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/features/session/sessionStore";
import { createMessageRouter, createRosterHandlers, type MessageHandlers } from "@/features/session/messageRouter";

beforeEach(() => setActivePinia(createPinia()));

/** The dispatcher tests use made-up types and the handler tests feed deliberately malformed frames. */
const unchecked = (handlers: Record<string, unknown>) => handlers as MessageHandlers;
type LooseHandlers = Record<string, (msg: any) => void>;

describe("createMessageRouter", () => {
  it("calls the handler registered for the type, with the whole message", () => {
    const a = vi.fn();
    const b = vi.fn();
    const route = createMessageRouter(unchecked({ a }), unchecked({ b }));
    route({ type: "b", x: 1 });
    expect(b).toHaveBeenCalledWith({ type: "b", x: 1 });
    expect(a).not.toHaveBeenCalled();
  });

  it("ignores an unknown type, as the old switch did", () => {
    const a = vi.fn();
    const route = createMessageRouter(unchecked({ a }));
    expect(() => route({ type: "nope" })).not.toThrow();
    expect(a).not.toHaveBeenCalled();
  });

  it("is not fooled by names on Object.prototype or by a non-string type", () => {
    const a = vi.fn();
    const route = createMessageRouter(unchecked({ a }));
    for (const type of ["constructor", "toString", "__proto__", "hasOwnProperty", ["a"], { toString: () => "a" }, 1, null, undefined])
      route({ type });
    route({});
    expect(a).not.toHaveBeenCalled();
  });

  it("still throws on a null or non-object frame, which the socket's try/catch swallows", () => {
    const route = createMessageRouter(unchecked({}));
    expect(() => route(null)).toThrow(TypeError);
  });

  it("refuses two handlers for one type", () => {
    expect(() => createMessageRouter(unchecked({ a: vi.fn() }), unchecked({ a: vi.fn() }))).toThrow("duplicate message handler: a");
  });
});

describe("roster handlers", () => {
  function setup() {
    const sync = vi.fn();
    const handlers = createRosterHandlers({ syncKnownMemberVolumes: sync }) as LooseHandlers;
    return { sync, handlers, session: useSessionStore() };
  }

  it("claims exactly the roster, chat, event and poke types", () => {
    expect(Object.keys(setup().handlers).sort()).toEqual([
      "channelList",
      "chatMessage",
      "memberAvatar",
      "memberEnter",
      "pokeReceived",
      "serverEvent",
    ]);
  });

  it("memberEnter adds a member once and re-syncs volumes", () => {
    const { handlers, session, sync } = setup();
    handlers.memberEnter!({ id: 5, nickname: "a", uid: "u", isSelf: 1 });
    handlers.memberEnter!({ id: 5, nickname: "again" });
    expect(session.members).toEqual([{ id: 5, nickname: "a", uid: "u", avatar: undefined, isSelf: true }]);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("channelList replaces the list and re-syncs volumes", () => {
    const { handlers, session, sync } = setup();
    session.channels.push({ id: "old" } as never);
    handlers.channelList!({ channels: [{ id: "1" }, { id: "2" }] });
    expect(session.channels.map((c) => c.id)).toEqual(["1", "2"]);
    handlers.channelList!({});
    expect(session.channels).toHaveLength(0);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("memberAvatar updates the roster and the channel tree, matching the uid when given", () => {
    const { handlers, session } = setup();
    session.members.push({ id: 5, uid: "u", nickname: "a", isSelf: false } as never);
    session.channels.push({
      id: "1",
      members: [
        { id: 5, uid: "u", nickname: "a" },
        { id: 6, uid: "v", nickname: "b" },
      ],
    } as never);
    handlers.memberAvatar!({ id: 5, uid: "other", avatar: "x" });
    expect(session.members[0]!.avatar).toBeUndefined();
    handlers.memberAvatar!({ id: 5, uid: "u", avatar: "x" });
    expect(session.members[0]!.avatar).toBe("x");
    expect(session.channels[0]!.members![0]!.avatar).toBe("x");
    expect(session.channels[0]!.members![1]!.avatar).toBeUndefined();
    handlers.memberAvatar!({ id: 5, avatar: "" });
    expect(session.members[0]!.avatar).toBeUndefined();
  });

  it("chatMessage skips echoes of the own client and normalises scope and target", () => {
    const { handlers, session } = setup();
    session.state.tsClientId = 9;
    handlers.chatMessage!({ invokerId: 9, message: "mine" });
    expect(session.chatMessages).toHaveLength(0);
    handlers.chatMessage!({ invokerId: 4, invokerName: "n", message: "hi", scope: "private", targetId: 0, senderUid: "s", timestamp: 7 });
    handlers.chatMessage!({ invokerId: 4, message: "c", scope: "channel", targetId: "12" });
    handlers.chatMessage!({ message: "sys", scope: "weird" });
    expect(session.chatMessages).toMatchObject([
      { scope: "private", conversationId: "uid:s", senderId: 4, senderUid: "s", invokerName: "n", message: "hi", timestamp: 7 },
      { scope: "channel", targetId: "12", invokerName: "Unknown" },
      { scope: "system", message: "sys", senderId: undefined },
    ]);
    expect(session.chatMessages[0]).not.toHaveProperty("targetId");
  });

  it("serverEvent appends only events that carry a string id", () => {
    const { handlers, session } = setup();
    handlers.serverEvent!({ event: { id: "e1" } });
    handlers.serverEvent!({ event: { id: 3 } });
    handlers.serverEvent!({});
    expect(session.serverEvents).toEqual([{ id: "e1" }]);
  });

  it("pokeReceived records who poked, with defaults", () => {
    const { handlers, session } = setup();
    handlers.pokeReceived!({ invokerId: 3, invokerUid: "u", invokerName: "n", message: "m", timestamp: 5 });
    handlers.pokeReceived!({});
    expect(session.pokeNotifications).toMatchObject([
      { invokerId: 3, invokerUid: "u", invokerName: "n", message: "m", timestamp: 5 },
      { invokerId: 0, invokerUid: "", invokerName: "Unknown", message: "" },
    ]);
  });
});

describe("bounds on what the gateway can make the store hold", () => {
  const handlers = () => createRosterHandlers({ syncKnownMemberVolumes() {} }) as unknown as LooseHandlers;

  it("keeps the newest 500 chat messages, 500 server events and 20 pokes", () => {
    const store = useSessionStore();
    const h = handlers();
    for (let i = 0; i < 700; i++) {
      h.chatMessage!({ invokerId: 9, invokerName: "a", message: `m${i}`, scope: "channel" });
      h.serverEvent!({ event: { id: `e${i}`, kind: "join", timestamp: i } });
      h.pokeReceived!({ invokerId: 1, invokerName: "a", message: `p${i}` });
    }
    expect(store.chatMessages).toHaveLength(500);
    expect(store.chatMessages.at(-1)?.message).toBe("m699");
    expect(store.chatMessages[0]?.message).toBe("m200");
    expect(store.serverEvents).toHaveLength(500);
    expect(store.pokeNotifications).toHaveLength(20);
    expect(store.pokeNotifications.at(-1)?.message).toBe("p699");
  });

  it("cuts chat text to 2000 characters and names to 128", () => {
    const store = useSessionStore();
    const h = handlers();
    h.chatMessage!({ invokerId: 9, invokerName: "n".repeat(10_000), message: "x".repeat(100_000), scope: "channel" });
    h.pokeReceived!({ invokerId: 1, invokerName: "n".repeat(10_000), message: "x".repeat(100_000) });
    expect(store.chatMessages[0]?.message).toHaveLength(2000);
    expect(store.chatMessages[0]?.invokerName).toHaveLength(128);
    expect(store.pokeNotifications[0]?.message).toHaveLength(2000);
    expect(store.pokeNotifications[0]?.invokerName).toHaveLength(128);
  });

  it("ignores an avatar over 512 KB and keeps a normal one", () => {
    const store = useSessionStore();
    const h = handlers();
    h.memberEnter!({ id: 1, nickname: "big", avatar: "a".repeat(512 * 1024 + 1) });
    h.memberEnter!({ id: 2, nickname: "small", avatar: "data:image/png;base64,AAAA" });
    expect(store.members.find((m) => m.id === 1)?.avatar).toBeUndefined();
    expect(store.members.find((m) => m.id === 2)?.avatar).toBe("data:image/png;base64,AAAA");
    h.memberAvatar!({ id: 2, avatar: "a".repeat(512 * 1024 + 1) });
    expect(store.members.find((m) => m.id === 2)?.avatar).toBeUndefined();
  });
});
