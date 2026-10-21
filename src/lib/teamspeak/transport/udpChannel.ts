import { createSocket, type Socket } from "node:dgram";
import { isIPv6 } from "node:net";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";

export interface UdpAddress {
  host: string;
  port: number;
}

export interface DatagramHandlers {
  message(datagram: Buffer): void;
  /** The channel is unusable afterwards. */
  error(error: TeamSpeakTransportError): void;
}

/** What the transport needs from a socket. Tests put a simulated link behind it. */
export interface DatagramChannel {
  attach(handlers: DatagramHandlers): void;
  send(datagram: Uint8Array): void;
  close(): void;
}

export type DatagramChannelFactory = (address: UdpAddress, signal?: AbortSignal) => Promise<DatagramChannel>;

const socketError = (error: unknown) =>
  new TeamSpeakTransportError("socketError", `UDP socket failed: ${error instanceof Error ? error.message : String(error)}`, {
    cause: error,
  });

class UdpChannel implements DatagramChannel {
  readonly #socket: Socket;
  #handlers: DatagramHandlers | undefined;
  #closed = false;

  constructor(socket: Socket) {
    this.#socket = socket;
    socket.on("message", (datagram) => this.#handlers?.message(datagram));
    socket.on("error", (error) => this.#fail(error));
  }

  attach(handlers: DatagramHandlers): void {
    this.#handlers = handlers;
  }

  send(datagram: Uint8Array): void {
    if (this.#closed) return;
    try {
      // Errors in the callback (ICMP unreachable while the server is down) are not fatal, the
      // resend and idle timers decide when to give up.
      this.#socket.send(datagram, () => undefined);
    } catch (error) {
      // dgram throws synchronously for some address and family mismatches. Reported on a later
      // turn so the caller is never re-entered from inside its own send.
      queueMicrotask(() => this.#fail(error));
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket.close();
  }

  #fail(error: unknown): void {
    if (this.#closed) return;
    this.close();
    this.#handlers?.error(socketError(error));
  }
}

/** A connected UDP socket, udp6 for IPv6 literals. Resolves once connected. */
export const openUdpChannel: DatagramChannelFactory = (address, signal) =>
  new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const socket = createSocket(isIPv6(address.host) ? "udp6" : "udp4");
    const cleanup = () => {
      socket.off("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onError = (error: Error) => {
      cleanup();
      socket.close();
      reject(socketError(error));
    };
    const onAbort = () => {
      cleanup();
      socket.close();
      reject(signal?.reason);
    };
    socket.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      socket.connect(address.port, address.host, () => {
        cleanup();
        resolve(new UdpChannel(socket));
      });
    } catch (error) {
      // A port out of range throws instead of emitting an error.
      onError(error as Error);
    }
  });
