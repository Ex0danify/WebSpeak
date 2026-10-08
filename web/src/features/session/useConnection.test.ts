// useConnection on its own (Step V6.1): a call-order spy for the teardown lambdas, and the pieces of the
// lifecycle that the message tests only reach through the whole composable.
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "./sessionStore";
import { FakeWebSocket } from "@/testSupport/fakeWebsocket";
import { useConnection } from "./useConnection";

function setup() {
  const volumes: Record<number, number> = {};
  const calls: string[] = [];
  const spy = (name: string) => vi.fn(() => { calls.push(name); });
  const deps = {
    audioPreferencesReady: Promise.resolve(),
    identityMaterial: ref(""),
    handleMessage: vi.fn(),
    handleAudioFrame: vi.fn(),
    clearLatencyProbes: spy("clearLatencyProbes"),
    rejectPendingCommands: vi.fn((error: Error) => { calls.push(`rejectPendingCommands:${error.message}`); }),
    stopMicrophone: spy("stopMicrophone"),
    clearMicrophoneError: spy("clearMicrophoneError"),
    clearAudioNotice: spy("clearAudioNotice"),
    stopScreenShareTransport: vi.fn((clear: boolean) => { calls.push(`stopScreenShareTransport:${clear}`); }),
    stopWebRtcTransport: spy("stopWebRtcTransport"),
    resetDownlink: spy("resetDownlink"),
    sendCmd: vi.fn(),
    applyWhisperState: vi.fn(),
    syncKnownMemberVolumes: vi.fn(),
    ensureMicrophone: vi.fn(async () => {}),
    setMicrophoneError: vi.fn(() => ({ key: "micFailedGeneric" as const })),
    startWebRtcTransport: vi.fn(async () => {}),
    sendScreenShareMessage: vi.fn(),
    isMicrophoneMuted: vi.fn(() => false),
    clearMemberVolumes: vi.fn(() => { for (const key of Object.keys(volumes)) delete volumes[Number(key)]; }),
  };
  const session = useSessionStore();
  return { calls, deps, volumes, session, connection: useConnection(deps) };
}

/** connect() and let the ticket fetch and the socket open. */
async function connectAndOpen(connection: ReturnType<typeof setup>["connection"], identity = "", rememberIdentity = false) {
  connection.connect("ts.example", "1", "guest", "", identity, rememberIdentity);
  await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  return FakeWebSocket.last;
}

beforeEach(() => {
  setActivePinia(createPinia());
  FakeWebSocket.reset();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ticket: "t 1" }) })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("disconnect", () => {
  it("calls the other modules' teardown in the order the old function did", async () => {
    const { connection, calls } = setup();
    await connectAndOpen(connection);
    calls.length = 0;
    connection.disconnect();
    expect(calls).toEqual([
      "clearLatencyProbes",
      "rejectPendingCommands:The voice connection was closed",
      "stopMicrophone",
      "clearMicrophoneError",
      "clearAudioNotice",
      "stopScreenShareTransport:true",
      "stopWebRtcTransport",
      "resetDownlink",
    ]);
  });

  it("closes the socket with 1000 after clearing ws, and resets the session", async () => {
    const { connection, session, volumes } = setup();
    const socket = await connectAndOpen(connection);
    socket.open();
    session.state.connected = true;
    session.state.tsClientId = 9;
    session.state.errorCode = "X";
    session.members.push({ clientId: 1 } as never);
    session.whisperTargetIds.add(3);
    session.whisperActive = true;
    volumes[4] = 1;
    connection.disconnect();
    expect(session.ws).toBeNull();
    expect(socket.closedWith).toEqual({ code: 1000, reason: undefined });
    expect(session.state).toMatchObject({ connected: false, connecting: false, tsClientId: 0, errorCode: "" });
    expect(session.members).toHaveLength(0);
    expect(session.whisperTargetIds.size).toBe(0);
    expect(session.whisperActive).toBe(false);
    expect(volumes).toEqual({});
  });

  it("with preserveConnection keeps what reconnectNow needs and leaves the screen-share streams alone", async () => {
    const { connection, deps } = setup();
    await connectAndOpen(connection);
    connection.disconnect(true);
    expect(deps.stopScreenShareTransport).toHaveBeenLastCalledWith(false);
    expect(connection.hasLastConnection()).toBe(true);
    connection.disconnect();
    expect(connection.hasLastConnection()).toBe(false);
  });

  it("bumps the sequence, so a late close of the old socket is ignored", async () => {
    const { connection, session, deps } = setup();
    const socket = await connectAndOpen(connection);
    const before = connection.getConnectionSequence();
    connection.disconnect();
    expect(connection.getConnectionSequence()).toBe(before + 1);
    deps.stopMicrophone.mockClear();
    socket.onclose?.({ code: 4004, reason: "" });
    expect(deps.stopMicrophone).not.toHaveBeenCalled();
    expect(session.state.errorCode).toBe("");
  });

  it("forgets the identity unless the person asked to remember it", async () => {
    const forgotten = setup();
    await connectAndOpen(forgotten.connection, "material", false);
    expect(forgotten.deps.identityMaterial.value).toBe("material");
    forgotten.connection.disconnect();
    expect(forgotten.deps.identityMaterial.value).toBe("");
    FakeWebSocket.reset();
    const kept = setup();
    await connectAndOpen(kept.connection, "material", true);
    kept.connection.disconnect();
    expect(kept.deps.identityMaterial.value).toBe("material");
  });
});

describe("connect", () => {
  it("posts the join ticket and opens the socket with it", async () => {
    const { connection, session } = setup();
    const socket = await connectAndOpen(connection);
    expect(fetch).toHaveBeenCalledWith("/api/join-ticket", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body)).toEqual({ target: "ts.example", nickname: "guest", channel: "1", serverPassword: "" });
    expect(socket.url).toMatch(/\/ws\/voice\?ticket=t%201$/);
    expect(socket.binaryType).toBe("arraybuffer");
    expect(session.state.connecting).toBe(true);
  });

  it("reports a refused ticket with its mapped message and code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ code: "RATE_LIMITED" }) })));
    const { connection, session } = setup();
    connection.connect("ts.example", "1", "guest");
    await vi.waitFor(() => expect(session.state.errorCode).toBe("RATE_LIMITED"));
    expect(session.state.error).toEqual({ key: "err_RATE_LIMITED" });
    expect(session.state.connecting).toBe(false);
  });

  it("drops a ticket that arrives after a newer connect", async () => {
    let release: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { release = resolve; })));
    const { connection } = setup();
    connection.connect("a", "1", "guest");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    connection.disconnect();
    release({ ok: true, json: async () => ({ ticket: "late" }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("routes text frames to handleMessage, binary frames to handleAudioFrame, and ignores malformed JSON", async () => {
    const { connection, deps } = setup();
    const socket = await connectAndOpen(connection);
    socket.receive({ type: "connected" });
    socket.receiveText("{nope");
    socket.onmessage?.({ data: new ArrayBuffer(4) });
    expect(deps.handleMessage).toHaveBeenCalledTimes(1);
    expect(deps.handleMessage).toHaveBeenCalledWith({ type: "connected" });
    expect(deps.handleAudioFrame).toHaveBeenCalledWith(new Uint8Array(4));
  });
});

describe("socket close", () => {
  it("maps a gateway close code to an error and tears down in order", async () => {
    const { connection, session, calls } = setup();
    const socket = await connectAndOpen(connection);
    calls.length = 0;
    socket.onclose?.({ code: 4005, reason: "" });
    expect(session.state.errorCode).toBe("IDENTITY_IN_USE");
    expect(calls).toEqual(["clearLatencyProbes", "rejectPendingCommands:The voice connection was closed", "stopWebRtcTransport", "stopMicrophone", "clearMicrophoneError", "clearAudioNotice"]);
  });

  it("stays silent on a plain 1000 leave but not on admin-terminated", async () => {
    const plain = setup();
    (await connectAndOpen(plain.connection)).onclose?.({ code: 1000, reason: "" });
    expect(plain.session.state.errorCode).toBe("");
    FakeWebSocket.reset();
    setActivePinia(createPinia());
    const admin = setup();
    (await connectAndOpen(admin.connection)).onclose?.({ code: 1000, reason: "admin-terminated" });
    expect(admin.session.state.errorCode).not.toBe("");
  });

  it("does not raise a second failure after connectionFailed reported this attempt (F23)", async () => {
    const { connection, session } = setup();
    const socket = await connectAndOpen(connection);
    connection.handlers.connectionFailed!({ type: "connectionFailed", code: "SERVER_REJECTED" });
    connection.clearError();
    socket.onclose?.({ code: 4004, reason: "" });
    expect(session.state.errorCode).toBe("");
  });

  it("uses the full-server message for a bare 4004", async () => {
    const { connection, session } = setup();
    (await connectAndOpen(connection)).onclose?.({ code: 4004, reason: "" });
    expect(session.state.error).toEqual({ key: "closeServerFullOrRejected" });
  });
});

describe("reconnectNow and identity", () => {
  it("does nothing without a previous connection, or while connecting", async () => {
    const { connection } = setup();
    connection.reconnectNow();
    expect(fetch).not.toHaveBeenCalled();
    await connectAndOpen(connection);
    connection.reconnectNow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reconnects with the remembered identity the gateway handed back", async () => {
    const { connection, session, deps } = setup();
    await connectAndOpen(connection, "seed", true);
    connection.handlers.connected!({ identity: "issued" } as never);
    session.state.connecting = false;
    connection.reconnectNow();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[1]![1].body)).toMatchObject({ identity: "issued", rememberIdentity: true });
    expect(deps.identityMaterial.value).toBe("issued");
  });

  it("clearError clears the message and the code", () => {
    const { connection, session } = setup();
    session.state.error = "e";
    session.state.errorCode = "C";
    connection.clearError();
    expect(session.state).toMatchObject({ error: "", errorCode: "" });
  });
});

describe("error messages", () => {
  it("connectionFailureMessage falls back to the generic text with a safe code", () => {
    const { connection } = setup();
    expect(connection.connectionFailureMessage("RATE_LIMITED")).toEqual({ key: "err_RATE_LIMITED" });
    expect(connection.connectionFailureMessage("weird code!")).toEqual({ key: "connectionFailedUnknown", params: { code: "WEIRD_CODE" } });
    expect(connection.connectionFailureMessage("weird code!", "detail")).toEqual({
      key: "connectionFailedUnknownDetail",
      params: { code: "WEIRD_CODE", detail: "detail" },
    });
  });

  it("protocolErrorMessage maps known codes and wraps unknown ones", () => {
    const { connection } = setup();
    expect(connection.protocolErrorMessage("CHANNEL_FULL", "x")).toEqual({ key: "err_CHANNEL_FULL" });
    expect(connection.protocolErrorMessage("BANNED", "x")).toEqual({ key: "opErr_BANNED" });
    expect(connection.protocolErrorMessage("NOPE", "boom")).toEqual({ key: "operationFailedUnknownDetail", params: { code: "NOPE", detail: "boom" } });
    expect(connection.protocolErrorMessage("NOPE", "")).toEqual({ key: "operationFailedUnknown", params: { code: "NOPE" } });
  });
});
