import { createSocket } from "node:dgram";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { isRestrictedAddress } from "../../infra/security/openTargetPolicy.js";
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
  lookupAddresses = defaultLookupAddresses,
  onError,
}: {
  host?: string;
  port?: number;
  token: string;
  allowPrivate?: boolean;
  idleTimeoutMs?: number;
  /** Injectable for tests, resolves every address of a hostname. */
  lookupAddresses?: LookupAddresses;
  /** Called when the socket fails after startup, the relay has already shut down by then. */
  onError?: (error: Error) => void;
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
      void openRelaySession(frame, client, socket, sessions, token, allowPrivate, lookupAddresses, send, cleanup);
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
  const sweep = setInterval(
    () => {
      const now = Date.now();
      for (const session of sessions.values()) if (now - session.lastActivity > idleTimeoutMs) cleanup(session);
    },
    Math.max(1000, Math.min(idleTimeoutMs, 5000)),
  );
  sweep.unref?.();

  const shutdown = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(sweep);
    for (const session of sessions.values()) cleanup(session);
    try {
      socket.close();
    } catch {
      /* never bound or already closed */
    }
  };

  // A throwing listener escapes emit() as an uncaught exception and would take the whole process down.
  let listening = false;
  let rejectStartup: (error: Error) => void = () => undefined;
  socket.on("error", (error) => {
    shutdown();
    if (listening) onError?.(error);
    else rejectStartup(error);
  });

  await new Promise<void>((resolve, reject) => {
    rejectStartup = reject;
    socket.once("listening", () => {
      listening = true;
      resolve();
    });
    try {
      socket.bind({ address: host, port });
    } catch (error) {
      // A synchronous bind failure never emits "error".
      shutdown();
      reject(asError(error));
    }
  });
  const address = socket.address();
  return {
    host,
    port: typeof address === "object" ? address.port : port,
    close: shutdown,
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
  lookupAddresses: LookupAddresses,
  send: (session: RelaySession, type: FrameType, payload?: Buffer) => void,
  cleanup: (session: RelaySession) => void,
): Promise<void> {
  const request = parseJson(frame.payload);
  if (!request || typeof request.targetHost !== "string" || !Number.isInteger(request.targetPort)) return;
  const targetPort = request.targetPort as number;
  const reply = (type: FrameType, payload: Buffer): void => {
    socket.send(encodeFrame(type, frame.sessionId, 0, payload, token), client.port, client.address);
  };
  // Judge what we will actually dial: a hostname can resolve to loopback or an internal host, and one DNS
  // answer can mix public and private records. The validated address is also the one we connect to, so a second
  // lookup cannot rebind us.
  let target: ResolvedTarget;
  try {
    target = await resolveTarget(request.targetHost, lookupAddresses);
  } catch (error) {
    reply(FrameType.OPEN_ERR, jsonPayload({ code: "TARGET_OPEN_FAILED", message: asError(error).message }));
    return;
  }
  if (!allowPrivate && target.addresses.some((address) => isRestrictedAddress(address.address))) {
    reply(FrameType.OPEN_ERR, jsonPayload({ code: "PRIVATE_TARGET_BLOCKED" }));
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

type LookupAddresses = (host: string) => Promise<Array<{ address: string; family: number }>>;

interface ResolvedTarget {
  host: string;
  family: number;
  /** Every address the name resolved to, all of them must pass the target policy. */
  addresses: Array<{ address: string; family: number }>;
}

const defaultLookupAddresses: LookupAddresses = (host) => lookup(host, { all: true, verbatim: true });

async function resolveTarget(host: string, lookupAddresses: LookupAddresses): Promise<ResolvedTarget> {
  const literal = isIP(host);
  const addresses = literal ? [{ address: host, family: literal }] : await lookupAddresses(host);
  const record = addresses.find((item) => item.family === 4) ?? addresses[0];
  if (!record) throw new Error("TARGET_DNS_EMPTY");
  return { host: record.address, family: record.family, addresses };
}
