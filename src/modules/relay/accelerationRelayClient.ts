import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { isIP } from "node:net";
import { asError, decodeFrame, encodeFrame, FrameType, jsonPayload, parseJson, verifyFrame } from "./accelerationRelayFrames.js";

export const DEFAULT_ACCELERATION_RELAY_PORT = 39087;

export interface AccelerationRelayOptions {
  relayHost: string;
  relayPort: number;
  token: string;
  timeoutMs?: number;
}

export interface ConfiguredAccelerationRelay extends AccelerationRelayOptions {
  id: string;
  name: string;
}

export interface AccelerationTarget {
  host: string;
  port: number;
}

export interface AccelerationRelayClient {
  readonly localHost: string;
  readonly localPort: number;
  readonly sessionId: number;
  close(): void;
}

export async function createAccelerationRelayClient(
  options: AccelerationRelayOptions & AccelerationTarget,
): Promise<AccelerationRelayClient> {
  validateRelayOptions(options);
  const relayFamily = isIP(options.relayHost) === 6 ? "udp6" : "udp4";
  const relaySocket = createSocket(relayFamily);
  const localSocket = createSocket("udp4");
  const sessionId = randomSessionId();
  let sequence = 1;
  let ready = false;
  let closed = false;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const sendFrame = (type: FrameType, payload: Buffer<ArrayBufferLike> = Buffer.alloc(0)): void => {
    if (closed) return;
    const packet = encodeFrame(type, sessionId, sequence++, payload, options.token);
    try {
      relaySocket.send(packet, options.relayPort, options.relayHost);
    } catch (error) {
      if (!ready) rejectReady(asError(error));
    }
  };

  const closeSockets = (): void => {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = null;
    try {
      relaySocket.close();
    } catch {
      /* already closed */
    }
    try {
      localSocket.close();
    } catch {
      /* already closed */
    }
  };

  const onSocketError = (error: Error): void => {
    if (!ready) rejectReady(error);
    closeSockets();
  };
  relaySocket.once("error", onSocketError);
  localSocket.once("error", onSocketError);

  let peer: { address: string; port: number } | null = null;
  relaySocket.on("message", (packet) => {
    const frame = decodeFrame(packet);
    if (!frame || frame.sessionId !== sessionId || !verifyFrame(frame, options.token)) return;
    if (frame.type === FrameType.OPEN_OK) {
      if (ready) return;
      ready = true;
      keepAlive = setInterval(() => sendFrame(FrameType.PING), 10_000);
      keepAlive.unref?.();
      resolveReady();
      return;
    }
    if (frame.type === FrameType.OPEN_ERR) {
      const detail = parseJson(frame.payload);
      rejectReady(new Error(typeof detail?.code === "string" ? detail.code : "ACCELERATION_OPEN_FAILED"));
      closeSockets();
      return;
    }
    if (frame.type === FrameType.DATA && peer) {
      try {
        localSocket.send(frame.payload, peer.port, peer.address);
      } catch {
        /* peer is gone */
      }
      return;
    }
    if (frame.type === FrameType.CLOSE) closeSockets();
  });

  await Promise.all([bindSocket(relaySocket, relayFamily === "udp6" ? "::" : "0.0.0.0"), bindSocket(localSocket, "127.0.0.1")]);

  localSocket.on("message", (payload, rinfo) => {
    if (closed) return;
    peer = { address: rinfo.address, port: rinfo.port };
    if (ready) sendFrame(FrameType.DATA, payload);
  });

  const timer = setTimeout(() => {
    rejectReady(new Error("ACCELERATION_OPEN_TIMEOUT"));
    closeSockets();
  }, options.timeoutMs ?? 15_000);
  timer.unref?.();
  sendFrame(FrameType.OPEN, jsonPayload({ targetHost: options.host, targetPort: options.port }));
  try {
    await readyPromise;
  } finally {
    clearTimeout(timer);
  }

  const address = localSocket.address();
  return {
    localHost: "127.0.0.1",
    localPort: typeof address === "object" ? address.port : 0,
    sessionId,
    close(): void {
      if (!closed && ready) {
        try {
          sendFrame(FrameType.CLOSE);
        } catch {
          /* best effort */
        }
      }
      closeSockets();
    },
  };
}

function validateRelayOptions(options: AccelerationRelayOptions & AccelerationTarget): void {
  if (!options.relayHost || !Number.isInteger(options.relayPort) || options.relayPort < 1 || options.relayPort > 65535)
    throw new Error("Invalid acceleration relay endpoint");
  if (!options.host || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
    throw new Error("Invalid accelerated TeamSpeak target");
  if (!options.token || options.token.length < 16) throw new Error("Acceleration relay token must contain at least 16 characters");
}

function bindSocket(socket: ReturnType<typeof createSocket>, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
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
    socket.bind(0, address);
  });
}

function randomSessionId(): number {
  const id = randomBytes(4).readUInt32BE(0);
  return id === 0 ? 1 : id;
}
