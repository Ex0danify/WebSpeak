import { DUMMY_PACKET_KEY, type PacketDirection, type PacketKey, type PacketKeySchedule } from "../crypto/packetKeys.js";
import { generationOf, idOf } from "./generationWindow.js";
import { MAC_BYTES, PACKET_TYPE_COUNT, PacketType } from "./packetTypes.js";

/** One key for every packet, the dummy keys of the handshake. */
export class FixedPacketKeys implements PacketKeySchedule {
  readonly #key: PacketKey;

  constructor(key: PacketKey) {
    this.#key = key;
  }

  keyFor(): PacketKey {
    return this.#key;
  }
}

export interface KeySwitch {
  keys: PacketKeySchedule;
  /** MAC of unencrypted packets from now on. Without it the previous one stays. */
  fakeMac?: Uint8Array;
  /**
   * First incoming index per packet type that uses the new keys. Types left out start at the
   * receive position the transport has reached for them.
   */
  receiveFrom?: Partial<Record<PacketType, number>>;
}

interface Epoch {
  keys: PacketKeySchedule;
  receiveFrom: readonly number[];
}

// Dummy 128, dummy 256 and session keys is the longest chain a handshake needs.
const MAX_EPOCHS = 3;

/**
 * Which keys protect which packet. Every switch opens an epoch: outgoing packets always use the newest,
 * an incoming packet uses the newest epoch whose start lies at or below its index. That is exact,
 * because the peer switches at a known packet, so no key is ever guessed.
 */
export class PacketProtection {
  readonly #sendDirection: PacketDirection;
  readonly #receiveDirection: PacketDirection;
  readonly #epochs: Epoch[];
  #fakeMac: Buffer | undefined;

  constructor(sendDirection: PacketDirection, initial: PacketKeySchedule = new FixedPacketKeys(DUMMY_PACKET_KEY)) {
    this.#sendDirection = sendDirection;
    this.#receiveDirection = sendDirection === "c2s" ? "s2c" : "c2s";
    this.#epochs = [{ keys: initial, receiveFrom: new Array<number>(PACKET_TYPE_COUNT).fill(0) }];
  }

  /** The fake MAC for outgoing unencrypted packets, zeros until a handshake set one. */
  get fakeMac(): Buffer {
    return this.#fakeMac ?? Buffer.alloc(MAC_BYTES);
  }

  /** Undefined before the handshake set a fake MAC: then any MAC on an unencrypted packet is accepted. */
  get expectedFakeMac(): Buffer | undefined {
    return this.#fakeMac;
  }

  /** `cursors` are the transport's receive positions per packet type. */
  switchKeys(next: KeySwitch, cursors: readonly number[]): void {
    if (next.fakeMac && next.fakeMac.length !== MAC_BYTES) throw new RangeError(`fake MAC must be ${MAC_BYTES} bytes`);
    const receiveFrom = cursors.map((cursor, type) => next.receiveFrom?.[type as PacketType] ?? cursor);
    this.#epochs.push({ keys: next.keys, receiveFrom });
    if (this.#epochs.length > MAX_EPOCHS) this.#epochs.shift();
    if (next.fakeMac) this.#fakeMac = Buffer.from(next.fakeMac);
  }

  sealKey(type: PacketType, index: number): PacketKey {
    const keys = this.#epochs[this.#epochs.length - 1].keys;
    return keys.keyFor(this.#sendDirection, type, generationOf(index), idOf(index));
  }

  /**
   * Candidate keys for an incoming packet, best first. Acks get the older epochs as a second try:
   * a peer acks a packet sealed with the old keys under its own switch rules (TS3 acks `clientek`
   * with the dummy key after the client has switched), and an ack opened by an older key is still
   * authentic.
   */
  openKeys(type: PacketType, index: number): PacketKey[] {
    const keys: PacketKey[] = [];
    for (let i = this.#epochs.length - 1; i >= 0; i--) {
      const epoch = this.#epochs[i];
      if (keys.length === 0 && index < epoch.receiveFrom[type]) continue;
      keys.push(epoch.keys.keyFor(this.#receiveDirection, type, generationOf(index), idOf(index)));
      if (type !== PacketType.ack && type !== PacketType.ackLow) break;
    }
    return keys;
  }
}
