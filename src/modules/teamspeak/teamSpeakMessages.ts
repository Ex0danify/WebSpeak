import type { TextMessage } from "@echosixhiya/teamspeak-client";

export interface TSVoiceData {
  clientId: number;
  codec: number; // 4 = voice, 5 = music
  data: Buffer;
}

export type TSChatScope = "channel" | "server" | "private";

export interface TSChatMessage {
  invokerName: string;
  invokerId: number;
  invokerUid: string;
  message: string;
  targetMode: number;
  targetId: bigint;
}

/**
 * Keep the target id of private messages, dropping it made the bridge dereference
 * undefined while echoing the message to the browser.
 */
export function toTSChatMessage(msg: TextMessage): TSChatMessage {
  return {
    invokerName: msg.invokerName,
    invokerId: msg.invokerID,
    invokerUid: msg.invokerUID,
    message: msg.message,
    targetMode: msg.targetMode,
    targetId: msg.targetID,
  };
}
