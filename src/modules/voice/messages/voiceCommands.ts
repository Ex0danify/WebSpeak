import { pingTeamSpeakSession } from "../../relay/index.js";
import type { WebClientEntry } from "../voiceTypes.js";
import { isRecord } from "../../../shared/typeGuards.js";
import { classifyOperationError } from "../session/voiceFailures.js";
import type { ClientCommand } from "./voiceProtocol.js";

export async function handleCommand(
  entry: WebClientEntry,
  command: ClientCommand,
  sendJson: (message: Record<string, unknown>) => void,
): Promise<void> {
  if (command.type === "latencyProbe") {
    const sequence = command.payload.sequence as string;
    const now = Date.now();
    if (now - entry.lastLatencyProbeAt < 150) return;
    entry.lastLatencyProbeAt = now;
    const result = await pingTeamSpeakSession((request, timeoutMs) => entry.tsClient.execCommandWithResponse(request, timeoutMs));
    sendJson({
      type: "latencyPong",
      sequence,
      teamSpeakLatencyMs: result.latencyMs,
      teamSpeakReachable: result.ok,
      teamSpeakErrorCode: result.errorCode ?? null,
    });
    return;
  }

  if (command.type === "switchChannel") {
    const rawId = command.payload.channelId as string;
    const channelPassword = typeof command.payload.password === "string" ? command.payload.password : "";
    // A channel that is not in the tree is gone (or was never visible): say so, do not ask for a password.
    if (!entry.channelTree.some((channel) => isRecord(channel) && channel.id === rawId)) {
      sendJson({
        type: "error",
        requestId: command.requestId,
        error: { code: "CHANNEL_NOT_FOUND", message: "Target channel is unavailable", recoverable: false },
      });
      return;
    }
    try {
      await entry.tsClient.switchChannel(BigInt(rawId), channelPassword || undefined);
    } catch (error: unknown) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      if (/already member/i.test(rawMessage)) {
        sendJson({ type: "channelSwitched", requestId: command.requestId, channelId: rawId });
        return;
      }
      const operation = classifyOperationError(error, "CHANNEL_SWITCH_FAILED", "Channel switch failed");
      sendJson({
        type: "error",
        requestId: command.requestId,
        error: { code: operation.code, message: operation.message, recoverable: false },
      });
      return;
    }
    sendJson({ type: "channelSwitched", requestId: command.requestId, channelId: rawId });
    sendJson({ type: "channelList", channels: entry.channelTree });
    return;
  }

  try {
    if (command.type === "moveClient") {
      const clientId = command.payload.clientId as number;
      const channelId = command.payload.channelId as string;
      if (clientId === entry.tsClient.getClientId()) {
        sendJson({
          type: "error",
          requestId: command.requestId,
          error: { code: "CANNOT_MOVE_SELF", message: "You cannot move your own client", recoverable: false },
        });
        return;
      }
      if (!entry.members.has(clientId)) {
        sendJson({
          type: "error",
          requestId: command.requestId,
          error: { code: "CLIENT_NOT_FOUND", message: "Client is offline or not visible", recoverable: false },
        });
        return;
      }
      const targetExists = entry.channelTree.some((channel) => isRecord(channel) && channel.id === channelId);
      if (!targetExists) {
        sendJson({
          type: "error",
          requestId: command.requestId,
          error: { code: "CHANNEL_NOT_FOUND", message: "Target channel is unavailable", recoverable: false },
        });
        return;
      }
      // TS checks i_client_move_power against the target's needed power inside clientmove, so forward the
      // command and don't duplicate that policy. Moving another client is an admin op, no channel password.
      await entry.tsClient.moveClient(clientId, BigInt(channelId));
    } else if (command.type === "sendTextMessage") {
      const message = (command.payload.message as string).trim();
      if (message) await entry.tsClient.sendTextMessage("channel", message, entry.tsClient.getChannelId());
    } else if (command.type === "sendServerMessage") {
      const message = (command.payload.message as string).trim();
      if (message) await entry.tsClient.sendTextMessage("server", message);
    } else if (command.type === "sendPrivateMessage") {
      const clientId = command.payload.clientId as number;
      if (!entry.members.has(clientId)) {
        sendJson({
          type: "error",
          requestId: command.requestId,
          error: { code: "CLIENT_NOT_FOUND", message: "Client is offline or not visible", recoverable: false },
        });
        return;
      }
      const message = (command.payload.message as string).trim();
      if (message) await entry.tsClient.sendTextMessage("private", message, BigInt(clientId));
    } else if (command.type === "poke") {
      const clientId = command.payload.clientId as number;
      if (!entry.members.has(clientId)) {
        sendJson({
          type: "error",
          requestId: command.requestId,
          error: { code: "CLIENT_NOT_FOUND", message: "Client is offline or not visible", recoverable: false },
        });
        return;
      }
      await entry.tsClient.poke(clientId, (command.payload.message as string).trim());
    } else if (command.type === "setAway") {
      await entry.tsClient.setAway(
        command.payload.away as boolean,
        typeof command.payload.message === "string" ? command.payload.message.trim() : "",
      );
    } else if (command.type === "setWhisperTargets") {
      const targetIds = command.payload.targetIds as number[];
      const selfId = entry.tsClient.getClientId();
      if (targetIds.some((clientId) => clientId === selfId || !entry.members.has(clientId))) {
        sendJson({
          type: "error",
          requestId: command.requestId,
          error: { code: "CLIENT_NOT_FOUND", message: "Client is offline or not visible", recoverable: false },
        });
        return;
      }
      entry.whisperTargetIds = new Set(targetIds);
      if (!entry.whisperTargetIds.size) entry.whisperActive = false;
      sendJson({ type: "whisperTargets", targetIds: [...entry.whisperTargetIds], active: entry.whisperActive });
    } else if (command.type === "setWhisperActive") {
      const active = command.payload.active as boolean;
      if (active && !entry.whisperTargetIds.size) {
        sendJson({
          type: "error",
          requestId: command.requestId,
          error: { code: "NO_WHISPER_TARGETS", message: "Select whisper targets first", recoverable: false },
        });
        return;
      }
      entry.whisperActive = active;
      sendJson({ type: "whisperTargets", targetIds: [...entry.whisperTargetIds], active: entry.whisperActive });
    } else if (command.type === "setMicrophoneMuted") {
      const muted = command.payload.muted as boolean;
      await entry.tsClient.setInputMuted(muted);
      entry.webrtc?.setMicrophoneMuted(muted);
    } else if (command.type === "setAccompanimentActive") {
      const active = command.payload.active as boolean;
      entry.webrtc?.setAccompanimentActive(active);
      await entry.tsClient.setAccompanimentActive(active);
    } else if (command.type === "setMemberVolume") {
      const clientId = command.payload.clientId as number;
      entry.webrtc?.setMemberVolume(clientId, command.payload.volume as number);
    }
    if (command.requestId) sendJson({ type: "commandCompleted", requestId: command.requestId });
  } catch (error: unknown) {
    const operation = classifyOperationError(error, "OPERATION_FAILED", "Operation failed");
    sendJson({
      type: "error",
      requestId: command.requestId,
      error: { code: operation.code, message: operation.message, recoverable: false },
    });
  }
}
