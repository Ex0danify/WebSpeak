import type { VoiceConnection, WebClientEntry } from "../voiceTypes.js";
import type { WebRtcAudioOptions } from "../../../config/webrtcConfig.js";
import { parseScreenShareMessage, type ScreenShareClientMessage } from "../../screenShare/index.js";
import { handleWebRtcOffer, handleWebRtcStop } from "../webrtc/webrtcOffer.js";
import { handleCommand } from "./voiceCommands.js";
import { isWebRtcStopMessage, parseWebRtcOffer } from "./voiceParse.js";
import { sendProtocolError } from "../session/voiceFailures.js";
import { parseClientCommand } from "./voiceProtocol.js";

export interface VoiceMessageRouterDeps {
  getWebRtcOptions(): WebRtcAudioOptions | undefined;
  handleScreenShareMessage(
    entry: WebClientEntry,
    message: ScreenShareClientMessage,
    sendJson: (message: Record<string, unknown>) => void,
  ): void;
}

/** Routes one text frame in order: WebRTC offer, stop, screen share, client command. */
export function routeTextFrame(ctx: VoiceConnection, data: Buffer | string, deps: VoiceMessageRouterDeps): void {
  const rawMessage = typeof data === "string" ? data : data.toString("utf-8");
  const webRtcOffer = parseWebRtcOffer(rawMessage);
  if (webRtcOffer) {
    if (deps.getWebRtcOptions()?.enabled !== true) {
      sendProtocolError(ctx.sendJson, "WEBRTC_DISABLED", "WebRTC audio transport is not enabled");
      return;
    }
    if (!ctx.state.tsReady || ctx.session.state !== "connected") {
      sendProtocolError(ctx.sendJson, "SESSION_NOT_READY", "TeamSpeak session is not ready yet");
      return;
    }
    void handleWebRtcOffer(ctx, webRtcOffer, deps.getWebRtcOptions);
    return;
  }
  if (isWebRtcStopMessage(rawMessage)) {
    handleWebRtcStop(ctx);
    return;
  }
  const screenShareMessage = parseScreenShareMessage(rawMessage);
  if (screenShareMessage) {
    if ("error" in screenShareMessage) {
      sendProtocolError(ctx.sendJson, screenShareMessage.error.code, screenShareMessage.error.message);
      return;
    }
    if (!ctx.state.tsReady || ctx.session.state !== "connected") {
      sendProtocolError(ctx.sendJson, "SESSION_NOT_READY", "TeamSpeak session is not ready yet");
      return;
    }
    deps.handleScreenShareMessage(ctx.entry, screenShareMessage, ctx.sendJson);
    return;
  }
  const command = parseClientCommand(rawMessage);
  if ("error" in command) {
    sendProtocolError(ctx.sendJson, command.error.code, command.error.message);
    return;
  }
  if (!ctx.state.tsReady || ctx.session.state !== "connected") {
    sendProtocolError(ctx.sendJson, "SESSION_NOT_READY", "TeamSpeak session is not ready yet");
    return;
  }
  void handleCommand(ctx.entry, command, ctx.sendJson);
}
