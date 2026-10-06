import type { VoiceConnection } from "../voiceTypes.js";
import { addServerEvent } from "../directory/voiceDirectory.js";

/** Registers the chat and poke listeners. Call it before connect(). */
export function registerVoiceChat(ctx: VoiceConnection): void {
  ctx.tsClient.on("textMessage", (message) => {
    const scope = message.targetMode === 1 ? "private" : message.targetMode === 3 ? "server" : message.targetMode === 2 ? "channel" : "server";
    const targetId = message.targetId ?? 0n;
    // TeamSpeak channel notifications omit `target`; the SDK represents
    // that as 0. Bind the broadcast to this session's current channel so
    // it remains visible now but cannot leak into another channel after a
    // later channel switch.
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
    ctx.sendJson({ type: "pokeReceived", invokerId: event.invokerID, invokerUid: event.invokerUID, invokerName: event.invokerName, message: event.message, timestamp: Date.now() });
    addServerEvent(ctx, "poke", `${event.invokerName || "用户"} 戳了你一下`, { nickname: event.invokerName });
  });
}
