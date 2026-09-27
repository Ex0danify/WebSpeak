// Scripted /ws/voice gateway. It answers the join ticket request and speaks just enough of the
// gateway protocol (see handleMessage() in web/src/composables/useVoiceWebSocket.ts) for the
// connected view to render without a TeamSpeak server. Voice audio is never sent.
//
// It serves the states a fake TeamSpeak client cannot produce cheaply: the reconnect banner, a
// failed reconnect, an audio encoder error, stacked pokes and the password-required codes.
//
// Two users: the Playwright specs of layer 4 and the screenshot tests of layer 6 (e2e/visual).
import type { BrowserContext, WebSocketRoute } from "@playwright/test";
import type { ClientCommand } from "../../src/server/voice-protocol";

/** A JSON message the gateway sends to the browser. */
export type ServerMessage = { type: string } & Record<string, unknown>;

/** The body of a `POST /api/join-ticket` the page made. */
export type JoinTicketRequest = Record<string, unknown>;

export interface ScriptedGatewayOptions {
  /**
   * Refuse the first socket like a gateway whose server wants a password: `connectionFailed`
   * with this code, then a close with 4003. The next socket connects normally.
   */
  firstConnectionFails?: string;
  /** Channel id to password. A `switchChannel` without it or with another one is refused. */
  channelPasswords?: Record<string, string>;
}

export interface ScriptedGateway {
  /** Bodies of the join ticket requests, in order. */
  readonly tickets: JoinTicketRequest[];
  /** Commands the browser sent, in order. */
  readonly commands: ClientCommand[];
  /** Sockets the browser opened so far. */
  readonly connections: number;
  /** Send a message on the open socket (the latest one). */
  send(message: ServerMessage): void;
  /** Keep the given members marked as speaking (the client holds the state for 360 ms). */
  startSpeaking(clientIds: number[]): void;
  /** Apply the scenario on top of the connected room. */
  apply(scenario: ScriptedScenario): void;
  stop(): void;
}

const SELF_ID = 1;

// 2026-01-15 20:12:00 UTC. Fixed so chat times are stable (the harness pins UTC).
const CHAT_TIME = Date.UTC(2026, 0, 15, 20, 12, 0);

const members = {
  1: { id: 1, nickname: "Snapshot Tester", uid: "uid-self" },
  2: { id: 2, nickname: "Alex Rivera", uid: "uid-alex", channelCommander: true },
  3: { id: 3, nickname: "Mira Tanaka", uid: "uid-mira", inputMuted: true },
  4: { id: 4, nickname: "Jonas Weber", uid: "uid-jonas", away: true, awayMessage: "Back in 10" },
  5: { id: 5, nickname: "Kenji Sato", uid: "uid-kenji", outputMuted: true },
};

const channels = [
  { id: "1", parentID: "0", order: "0", name: "Lobby", members: [members[4]] },
  { id: "2", parentID: "0", order: "1", name: "Raid Night", members: [members[1], members[2], members[3]] },
  { id: "3", parentID: "2", order: "0", name: "Strategy", members: [members[5]] },
  { id: "4", parentID: "0", order: "2", name: "AFK", members: [] },
];

const chat = [
  { invokerId: 2, invokerName: "Alex Rivera", senderUid: "uid-alex", message: "Pull starts in five minutes, grab your flasks.", offset: 0 },
  { invokerId: 3, invokerName: "Mira Tanaka", senderUid: "uid-mira", message: "On my way. Mic is broken, I will type in chat.", offset: 60_000 },
  { invokerId: 2, invokerName: "Alex Rivera", senderUid: "uid-alex", message: "https://example.com/strategy/a-very-long-link-that-must-wrap-instead-of-overflowing-the-message-bubble", offset: 120_000 },
];

/** The scenarios the snapshot harness takes a shot of. */
export const connectedScenarios = ["connected", "poke", "reconnecting", "reconnect-failed", "audio-notice"] as const;

/** Every scenario `apply` knows: the snapshot ones plus the states only the specs look at. */
export type ScriptedScenario = (typeof connectedScenarios)[number] | "pokes" | "reconnected";

/**
 * Install the fixture on a browser context, before the first navigation. Returns a handle used to
 * drive a scenario once the page has submitted the join form.
 */
export async function installVoiceFixture(context: BrowserContext, options: ScriptedGatewayOptions = {}): Promise<ScriptedGateway> {
  let socket: WebSocketRoute | null = null;
  let speakingTimer: ReturnType<typeof setInterval> | null = null;
  const tickets: JoinTicketRequest[] = [];
  const commands: ClientCommand[] = [];
  let connections = 0;

  await context.route("**/api/join-ticket", (route) => {
    tickets.push(JSON.parse(route.request().postData() || "{}"));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ticket: tickets.length === 1 ? "snapshot-ticket" : `snapshot-ticket-${tickets.length}` }),
    });
  });

  await context.routeWebSocket(/\/ws\/voice/, (ws) => {
    socket = ws;
    connections++;
    const reply = (payload: ServerMessage) => ws.send(JSON.stringify(payload));
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return;
      let message: ClientCommand;
      try { message = JSON.parse(raw); } catch { return; }
      commands.push(message);
      const channelPassword = message.type === "switchChannel" ? options.channelPasswords?.[String(message.payload?.channelId)] : undefined;
      if (channelPassword !== undefined && message.payload?.password !== channelPassword) {
        reply({ type: "error", requestId: message.requestId, error: { code: "CHANNEL_PASSWORD_REQUIRED", message: "needs password" } });
        return;
      }
      if (message.requestId) reply({ type: "commandCompleted", requestId: message.requestId });
      if (channelPassword !== undefined) reply({ type: "channelSwitched", channelId: message.payload?.channelId });
      if ((message.type as string) === "screenShareList") reply({ type: "screenShareList", streams: [] });
    });
    if (options.firstConnectionFails && connections === 1) {
      reply({ type: "connectionFailed", code: options.firstConnectionFails });
      ws.close({ code: 4003, reason: options.firstConnectionFails });
      return;
    }
    reply({
      type: "connected",
      tsClientId: SELF_ID,
      members: Object.values(members),
      serverEventLog: [],
      whisperTargetIds: [],
      whisperActive: false,
    });
    reply({ type: "channelList", channels });
    for (const entry of chat) {
      reply({ type: "chatMessage", scope: "channel", targetId: "2", invokerId: entry.invokerId, invokerName: entry.invokerName, senderUid: entry.senderUid, message: entry.message, timestamp: CHAT_TIME + entry.offset });
    }
  });

  const send = (payload: ServerMessage) => {
    if (!socket) throw new Error("voice socket is not open");
    socket.send(JSON.stringify(payload));
  };

  return {
    tickets,
    commands,
    get connections() { return connections; },
    send,
    startSpeaking(clientIds) {
      speakingTimer = setInterval(() => { try { send({ type: "voiceActivity", clientIds }); } catch { /* closed */ } }, 100);
      send({ type: "voiceActivity", clientIds });
    },
    apply(scenario) {
      if (scenario === "connected") this.startSpeaking([2]);
      else if (scenario === "poke") {
        this.startSpeaking([2]);
        send({ type: "pokeReceived", invokerId: 2, invokerUid: "uid-alex", invokerName: "Alex Rivera", message: "Raid is starting", timestamp: CHAT_TIME + 180_000 });
      } else if (scenario === "pokes") {
        send({ type: "pokeReceived", invokerId: 2, invokerUid: "uid-alex", invokerName: "Alex Rivera", message: "Raid is starting", timestamp: CHAT_TIME + 180_000 });
        send({ type: "pokeReceived", invokerId: 3, invokerUid: "uid-mira", invokerName: "Mira Tanaka", message: "Wipe recovery", timestamp: CHAT_TIME + 181_000 });
      } else if (scenario === "reconnecting") send({ type: "reconnecting", attempt: 2 });
      else if (scenario === "reconnected") send({ type: "reconnected" });
      else if (scenario === "reconnect-failed") send({ type: "reconnectFailed", code: "CONNECTION_FAILED" });
      else if (scenario === "audio-notice") send({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "opus encoder unavailable" });
      else throw new Error(`unknown scenario ${scenario}`);
    },
    stop() {
      if (speakingTimer) clearInterval(speakingTimer);
    },
  };
}
