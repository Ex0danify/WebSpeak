// A real UDP proxy that impairs the datagrams between the gateway and a TeamSpeak server: drop,
// duplicate, reorder and delay, seeded so a run reproduces. Unlike tsLinkSimulator (in-process
// DatagramChannels on a fake clock) this speaks node:dgram with real timers, for the layer-5 soak.
import { createSocket, type Socket } from "node:dgram";
import { seededRandom } from "./tsLinkSimulator.js";

export interface UdpImpairment {
  /** Probability per datagram, each direction. */
  drop?: number;
  duplicate?: number;
  /** Probability of an extra delay of up to reorderMs, which lets later datagrams overtake. */
  reorder?: number;
  reorderMs?: number;
  /** One-way base delay in ms. Default 0. */
  delayMs?: number;
}

export interface UdpImpairmentProxyOptions {
  target: { host: string; port: number };
  impairment?: UdpImpairment;
  seed?: number;
}

export interface UdpImpairmentStats {
  sent: number;
  dropped: number;
  duplicated: number;
}

export interface UdpImpairmentProxy {
  readonly host: string;
  readonly port: number;
  readonly stats: UdpImpairmentStats;
  close(): Promise<void>;
}

interface ClientLink {
  back: Socket;
  address: string;
  port: number;
}

/** Listens on a loopback port; the gateway aims at it, it relays to `target` and back, impaired. */
export async function createUdpImpairmentProxy(options: UdpImpairmentProxyOptions): Promise<UdpImpairmentProxy> {
  const { target } = options;
  const { drop = 0, duplicate = 0, reorder = 0, reorderMs = 60, delayMs = 0 } = options.impairment ?? {};
  const random = seededRandom(options.seed ?? 1);
  const stats: UdpImpairmentStats = { sent: 0, dropped: 0, duplicated: 0 };
  const timers = new Set<NodeJS.Timeout>();
  const links = new Map<string, ClientLink>();
  let closed = false;

  const front = createSocket("udp4");

  // Hands a datagram to `deliver` once, maybe twice, maybe never, maybe late.
  const relay = (datagram: Buffer, deliver: (data: Buffer) => void) => {
    stats.sent++;
    if (random() < drop) {
      stats.dropped++;
      return;
    }
    const schedule = (copy: Buffer) => {
      const delay = delayMs + (random() < reorder ? random() * reorderMs : 0);
      if (delay <= 0) return deliver(copy);
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!closed) deliver(copy);
      }, delay);
      timers.add(timer);
    };
    schedule(datagram);
    if (random() < duplicate) {
      stats.duplicated++;
      schedule(Buffer.from(datagram));
    }
  };

  front.on("message", (datagram, rinfo) => {
    const key = `${rinfo.address}:${rinfo.port}`;
    let link = links.get(key);
    if (!link) {
      const back = createSocket("udp4");
      link = { back, address: rinfo.address, port: rinfo.port };
      links.set(key, link);
      back.on("message", (reply) => relay(Buffer.from(reply), (data) => front.send(data, link!.port, link!.address)));
    }
    relay(Buffer.from(datagram), (data) => link!.back.send(data, target.port, target.host));
  });

  await new Promise<void>((resolve, reject) => {
    front.once("error", reject);
    front.bind(0, "127.0.0.1", () => {
      front.off("error", reject);
      resolve();
    });
  });

  return {
    host: "127.0.0.1",
    port: front.address().port,
    stats,
    async close() {
      closed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const link of links.values()) link.back.close();
      links.clear();
      await new Promise<void>((resolve) => front.close(resolve));
    },
  };
}
