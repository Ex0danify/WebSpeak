import type { VoiceConnection } from "./voiceTypes.js";

const SELF_ACTIVITY_INTERVAL_MS = 100;

/**
 * Called for every frame sent to TeamSpeak. The browser only shows us speaking while the gateway really
 * forwards our voice and the channel lets it through, a moderated channel drops it without telling us.
 */
export function reportSelfActivity(ctx: VoiceConnection): void {
  const { entry, state } = ctx;
  if (!state.selfId || !ctx.tsClient.isConnected() || !ctx.tsClient.canSpeak()) return;
  const now = Date.now();
  if (now - entry.selfActivityAt < SELF_ACTIVITY_INTERVAL_MS) return;
  entry.selfActivityAt = now;
  ctx.sendJson({ type: "voiceActivity", clientIds: [state.selfId] });
}

/** Tells the browser when the server starts or stops letting us write to the channel or the server. */
export function syncChatState(ctx: VoiceConnection): void {
  const canWriteChannel = ctx.tsClient.canSendText("channel");
  const canWriteServer = ctx.tsClient.canSendText("server");
  if (canWriteChannel === ctx.entry.canWriteChannel && canWriteServer === ctx.entry.canWriteServer) return;
  ctx.entry.canWriteChannel = canWriteChannel;
  ctx.entry.canWriteServer = canWriteServer;
  if (ctx.state.initialStateSent) ctx.sendJson({ type: "chatState", canWriteChannel, canWriteServer });
}

/** Tells the browser when our talk right in the current channel changes. Call it after the directory moved. */
export function syncTalkState(ctx: VoiceConnection): void {
  const canSpeak = ctx.tsClient.canSpeak();
  if (canSpeak === ctx.entry.canSpeak) return;
  ctx.entry.canSpeak = canSpeak;
  if (ctx.state.initialStateSent) ctx.sendJson({ type: "talkState", canSpeak });
}
