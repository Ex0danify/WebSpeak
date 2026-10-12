import { createSocket } from "node:dgram";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import {
  asError,
  decodeFrame,
  encodeFrame,
  FrameType,
  jsonPayload,
  parseJson,
  verifyFrame,
  type Frame,
} from "./accelerationRelayFrames.js";

export async function createAccelerationRelayServer({
  host = "0.0.0.0",
  port = 39087,
  token,
  allowPrivate = false,
  idleTimeoutMs = 30_000,
}: {
  host?: string;
  port?: number;
  token: string;
  allowPrivate?: boolean;
  idleTimeoutMs?: number;
}): Promise<{ host: string; port: number; close(): void }> {
  if (!token || token.length < 16) throw new Error("Acceleration relay token must contain at least 16 characters");
  const socket = createSocket(isIP(host) === 6 ? "udp6" : "udp4");
  const sessions = new Map<number, RelaySession>();
  let closed = false;

  const send = (session: RelaySession, type: FrameType, payload: Buffer<ArrayBufferLike> = Buffer.alloc(0)): void => {
    if (closed) return;
    try {
      socket.send(encodeFrame(type, session.id, session.outSequence++, payload, token), session.client.port, session.client.address);
    } catch {
      /* client is gone */
    }
  };
  const cleanup = (session: RelaySession): void => {
    if (session.closed) return;
    session.closed = true;
    sessions.delete(session.id);
    session.targetSocket?.close();
  };

  socket.on("message", (packet, rinfo) => {
    const frame = decodeFrame(packet);
    if (!frame || !verifyFrame(frame, token)) return;
    const client = { address: rinfo.address, port: rinfo.port };
    if (frame.type === FrameType.OPEN) {
      void openRelaySession(frame, client, socket, sessions, token, allowPrivate, send, cleanup);
      return;
    }
    const session = sessions.get(frame.sessionId);
    if (!session || session.client.address !== rinfo.address || session.client.port !== rinfo.port) return;
    session.lastActivity = Date.now();
    if (frame.type === FrameType.DATA && session.targetSocket) session.targetSocket.send(frame.payload);
    else if (frame.type === FrameType.PING) send(session, FrameType.PONG);
    else if (frame.type === FrameType.CLOSE) {
      send(session, FrameType.CLOSE);
      cleanup(session);
    }
  });
  socket.on("error", (error) => {
    for (const session of sessions.values()) cleanup(session);
    if (!closed) throw error;
  });

  const sweep = setInterval(
    () => {
      const now = Date.now();
      for (const session of sessions.values()) if (now - session.lastActivity > idleTimeoutMs) cleanup(session);
    },
    Math.max(1000, Math.min(idleTimeoutMs, 5000)),
  );
  sweep.unref?.();

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      socket.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      socket.off("error", onError);
      resolve();
    };
    socket.once("error", onError);
    socket.once("listening", onListening);
    socket.bind({ address: host, port });
  });
  const address = socket.address();
  return {
    host,
    port: typeof address === "object" ? address.port : port,
    close(): void {
      if (closed) return;
      closed = true;
      clearInterval(sweep);
      for (const session of sessions.values()) cleanup(session);
      socket.close();
    },
  };
}

interface RelaySession {
  id: number;
  client: { address: string; port: number };
  targetSocket: ReturnType<typeof createSocket> | null;
  outSequence: number;
  lastActivity: number;
  closed: boolean;
}

async function openRelaySession(
  frame: Frame,
  client: { address: string; port: number },
  socket: ReturnType<typeof createSocket>,
  sessions: Map<number, RelaySession>,
  token: string,
  allowPrivate: boolean,
  send: (session: RelaySession, type: FrameType, payload?: Buffer) => void,
  cleanup: (session: RelaySession) => void,
): Promise<void> {
  const request = parseJson(frame.payload);
  if (!request || typeof request.targetHost !== "string" || !Number.isInteger(request.targetPort)) return;
  const targetPort = request.targetPort as number;
  if (!allowPrivate && isPrivateAddress(request.targetHost)) {
    socket.send(
      encodeFrame(FrameType.OPEN_ERR, frame.sessionId, 0, jsonPayload({ code: "PRIVATE_TARGET_BLOCKED" }), token),
      client.port,
      client.address,
    );
    return;
  }
  const previous = sessions.get(frame.sessionId);
  if (previous) cleanup(previous);
  const session: RelaySession = {
    id: frame.sessionId,
    client,
    targetSocket: null,
    outSequence: 1,
    lastActivity: Date.now(),
    closed: false,
  };
  sessions.set(session.id, session);
  try {
    const target = await resolveTarget(request.targetHost);
    const targetSocket = createSocket(target.family === 6 ? "udp6" : "udp4");
    session.targetSocket = targetSocket;
    targetSocket.on("message", (payload) => {
      session.lastActivity = Date.now();
      send(session, FrameType.DATA, payload);
    });
    targetSocket.on("error", (error) => {
      if (!session.closed) send(session, FrameType.OPEN_ERR, jsonPayload({ code: "TARGET_SOCKET_ERROR", message: error.message }));
      cleanup(session);
    });
    targetSocket.connect(targetPort, target.host, () => {
      session.lastActivity = Date.now();
      send(session, FrameType.OPEN_OK, jsonPayload({ targetHost: target.host, targetPort }));
    });
  } catch (error) {
    cleanup(session);
    socket.send(
      encodeFrame(
        FrameType.OPEN_ERR,
        frame.sessionId,
        0,
        jsonPayload({ code: "TARGET_OPEN_FAILED", message: asError(error).message }),
        token,
      ),
      client.port,
      client.address,
    );
  }
}

function isPrivateAddress(host: string): boolean {
  const family = isIP(host);
  if (family === 4) {
    const parts = host.split(".").map(Number);
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }
  if (family === 6) {
    const normalized = host.toLocaleLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return host === "localhost" || host.endsWith(".localhost");
}

async function resolveTarget(host: string): Promise<{ host: string; family: number }> {
  const family = isIP(host);
  if (family) return { host, family };
  const records = await lookup(host, { all: true, verbatim: true });
  const record = records.find((item) => item.family === 4) ?? records[0];
  if (!record) throw new Error("TARGET_DNS_EMPTY");
  return { host: record.address, family: record.family };
}
