// requestLinkPreview and the two frames that answer it, with a FakeWebSocket in the session store.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/features/session/sessionStore";
import { text } from "@/shared/i18n/localizedText";
import { FakeWebSocket } from "@/testSupport/fakeWebsocket";
import { useSessionActions } from "@/features/session/useSessionActions";

let socket: FakeWebSocket;

function setup(open = true) {
  const session = useSessionStore();
  socket = new FakeWebSocket("ws://test");
  if (open) socket.open();
  session.ws = socket as unknown as WebSocket;
  return {
    session,
    actions: useSessionActions({
      protocolErrorMessage: (code, fallback) => text("operationFailedUnknownDetail", { code, detail: fallback }),
    }),
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  FakeWebSocket.reset();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const preview = { kind: "page", url: "https://a.example", siteName: "S", title: "T", description: "" } as const;

describe("requestLinkPreview", () => {
  it("rejects at once when the socket is not open", async () => {
    const { actions } = setup(false);
    await expect(actions.requestLinkPreview("https://a.example")).rejects.toThrow("The voice connection is not ready yet");
  });

  it("sends getLinkPreview, adds full only when asked and resolves with the matching reply", async () => {
    const { actions } = setup();
    const plain = actions.requestLinkPreview("https://a.example");
    const full = actions.requestLinkPreview("https://a.example/big.png", true);
    const [first, second] = socket.sentJson;
    expect(first).toMatchObject({ type: "getLinkPreview", payload: { url: "https://a.example" } });
    expect(first!.payload).not.toHaveProperty("full");
    expect(second).toMatchObject({ payload: { url: "https://a.example/big.png", full: true } });
    actions.handlers.linkPreview!({ type: "linkPreview", requestId: "other", url: "x", preview });
    actions.handlers.linkPreview!({ type: "linkPreview", requestId: second!.requestId as string, url: "x", preview });
    actions.handlers.linkPreview!({ type: "linkPreview", requestId: first!.requestId as string, url: "x", preview });
    await expect(plain).resolves.toEqual(preview);
    await expect(full).resolves.toEqual(preview);
  });

  it("rejects with the code of an error frame and does not touch the session error", async () => {
    const { session, actions } = setup();
    const asked = actions.requestLinkPreview("https://a.example");
    actions.handlers.linkPreviewError!({
      type: "linkPreviewError",
      requestId: socket.sentJson[0]!.requestId as string,
      url: "https://a.example",
      code: "LINK_PREVIEW_BLOCKED",
    });
    await expect(asked).rejects.toMatchObject({ code: "LINK_PREVIEW_BLOCKED" });
    expect(session.state.error).toBe("");
  });

  it("times out, and a disconnect rejects what is waiting", async () => {
    vi.useFakeTimers();
    const { actions } = setup();
    const slow = actions.requestLinkPreview("https://a.example", false, 500).then(
      () => new Error("resolved"),
      (error: Error) => error,
    );
    await vi.advanceTimersByTimeAsync(500);
    expect((await slow).message).toBe("The operation timed out. Try again shortly");
    const waiting = actions.requestLinkPreview("https://b.example").then(
      () => new Error("resolved"),
      (error: Error) => error,
    );
    actions.rejectPendingCommands(new Error("closed"));
    expect((await waiting).message).toBe("closed");
  });
});
