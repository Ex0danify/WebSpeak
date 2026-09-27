import type { JoinTicketPayload } from "../../src/server/join-ticket.js";
import type { FakeTSClient } from "./fake-ts-client.js";
import type { Gateway } from "./gateway.js";
import type { JsonMessage, WsClient } from "./ws-client.js";

export interface VoiceSession {
  socket: WsClient;
  /** The fake TeamSpeak client behind the session. */
  client: FakeTSClient;
  /** The `tsClientId` of the `connected` message. */
  id: number;
}

/**
 * Joins with a fresh ticket and waits until the gateway has sent the whole
 * initial state (`connected`, then `channelList`). Nicknames must be unique
 * per gateway, because the fake client is found by its nickname.
 */
export async function joinVoice(gateway: Gateway, payload: Partial<JoinTicketPayload> & { nickname: string }): Promise<VoiceSession> {
  const socket = await gateway.openVoice(gateway.ticket(payload));
  const connected = await socket.waitForMessage("connected");
  await socket.waitForMessage("channelList");
  const client = gateway.ts.created.find((candidate) => candidate.options.nickname === payload.nickname);
  if (!client) throw new Error(`no fake client for ${payload.nickname}`);
  return { socket, client, id: connected.tsClientId as number };
}

/** Sends a command with a request id and returns the first message that answers that id. */
export async function ask(session: VoiceSession, type: string, payload: Record<string, unknown>, requestId = `r-${Math.random().toString(36).slice(2)}`): Promise<JsonMessage> {
  const after = session.socket.mark();
  session.socket.send({ type, requestId, payload });
  return session.socket.waitForMessage((message) => message.requestId === requestId, { after });
}

/** The `error` object of an `error` message. */
export const errorOf = (message: JsonMessage) => message.error as { code: string; message: string; recoverable: boolean };
