// Scripted /ws/voice gateway for the snapshot harness. It answers the join
// ticket request and speaks just enough of the gateway protocol (see
// handleMessage() in src/composables/useVoiceWebSocket.ts) for the connected
// view to render without a TeamSpeak server. Voice audio is never sent.

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

export const connectedScenarios = ["connected", "poke", "reconnecting", "reconnect-failed", "audio-notice"];

/**
 * Install the fixture on a browser context. Returns a handle used to drive a
 * scenario once the page has submitted the join form.
 */
export async function installVoiceFixture(context) {
  let socket = null;
  let speakingTimer = null;

  await context.route("**/api/join-ticket", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ticket: "snapshot-ticket" }),
  }));

  await context.routeWebSocket(/\/ws\/voice/, (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return;
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (message.requestId) ws.send(JSON.stringify({ type: "commandCompleted", requestId: message.requestId }));
      if (message.type === "screenShareList") ws.send(JSON.stringify({ type: "screenShareList", streams: [] }));
    });
    const send = (payload) => ws.send(JSON.stringify(payload));
    send({
      type: "connected",
      tsClientId: SELF_ID,
      members: Object.values(members),
      serverEventLog: [],
      whisperTargetIds: [],
      whisperActive: false,
    });
    send({ type: "channelList", channels });
    for (const entry of chat) {
      send({ type: "chatMessage", scope: "channel", targetId: "2", invokerId: entry.invokerId, invokerName: entry.invokerName, senderUid: entry.senderUid, message: entry.message, timestamp: CHAT_TIME + entry.offset });
    }
  });

  const send = (payload) => {
    if (!socket) throw new Error("voice socket is not open");
    socket.send(JSON.stringify(payload));
  };

  return {
    /** Keep the given members marked as speaking (the client holds the state for 360 ms). */
    startSpeaking(clientIds) {
      speakingTimer = setInterval(() => { try { send({ type: "voiceActivity", clientIds }); } catch { /* closed */ } }, 100);
      send({ type: "voiceActivity", clientIds });
    },
    /** Apply the scenario on top of the connected room. */
    apply(scenario) {
      if (scenario === "connected") this.startSpeaking([2]);
      else if (scenario === "poke") {
        this.startSpeaking([2]);
        send({ type: "pokeReceived", invokerId: 2, invokerUid: "uid-alex", invokerName: "Alex Rivera", message: "Raid is starting", timestamp: CHAT_TIME + 180_000 });
      } else if (scenario === "reconnecting") send({ type: "reconnecting", attempt: 2 });
      else if (scenario === "reconnect-failed") send({ type: "reconnectFailed", code: "CONNECTION_FAILED" });
      else if (scenario === "audio-notice") send({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "opus encoder unavailable" });
      else throw new Error(`unknown scenario ${scenario}`);
    },
    stop() {
      if (speakingTimer) clearInterval(speakingTimer);
    },
  };
}
