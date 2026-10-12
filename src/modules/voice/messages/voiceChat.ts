import type { VoiceConnection } from "../voiceTypes.js";
import { addServerEvent } from "../directory/voiceDirectory.js";

/** Registers the chat and poke listeners, call it before connect(). */
export function registerVoiceChat(ctx: VoiceConnection): void {
  ctx.tsClient.on("textMessage", (message) => {
    const scope =
      message.targetMode === 1 ? "private" : message.targetMode === 3 ? "server" : message.targetMode === 2 ? "channel" : "server";
    const targetId = message.targetId ?? 0n;
    // Channel notifications omit target and the SDK reports 0. Bind the message to this session's
    // current channel so it cannot leak into another one after a later switch.
    const effectiveTargetId = scope === "channel" && targetId === 0n ? ctx.tsClient.getChannelId() : targetId;
    ctx.sendJson({
      type: "chatMessage",
      scope,
      ...(effectiveTargetId !== 0n ? { targetId: String(effectiveTargetId) } : {}),
      senderUid: message.invokerUid,
      timestamp: Date.now(),
      invokerName: message.invokerName,
      invokerId: message.invokerId,
      message: message.message,
    });
  });

  ctx.tsClient.on("poked", (event) => {
    ctx.sendJson({
      type: "pokeReceived",
      invokerId: event.invokerID,
      invokerUid: event.invokerUID,
      invokerName: event.invokerName,
      message: event.message,
      timestamp: Date.now(),
    });
    addServerEvent(ctx, "poke", `${event.invokerName || "A user"} poked you`, { nickname: event.invokerName });
  });
}
