import { describe, expect, it } from "vitest";
import { ReliableSender, RttEstimator } from "./reliableSender.js";

const datagram = (index: number) => Buffer.from([index & 0xff]);

describe("RttEstimator", () => {
  it("starts at the initial RTO and follows RFC 6298 after samples", () => {
    const rtt = new RttEstimator();
    expect(rtt.rtoMs).toBe(1_000);
    rtt.sample(200);
    expect(rtt.smoothedRttMs).toBe(200);
    expect(rtt.rtoMs).toBe(200 + 4 * 100);
    rtt.sample(100);
    expect(rtt.smoothedRttMs).toBe(187.5);
    expect(rtt.rtoMs).toBe(187.5 + 4 * (0.75 * 100 + 0.25 * 100));
  });

  it("clamps the RTO", () => {
    const rtt = new RttEstimator({ initialRtoMs: 10 });
    expect(rtt.rtoMs).toBe(100);
    for (let i = 0; i < 20; i++) rtt.sample(1);
    expect(rtt.rtoMs).toBe(100);
    rtt.sample(10_000);
    expect(rtt.rtoMs).toBe(3_000);
  });
});

describe("ReliableSender", () => {
  it("sends once, resends with a doubling interval up to the cap and stops after the ack", () => {
    const sender = new ReliableSender(new RttEstimator({ initialRtoMs: 1_000 }), { maxRtoMs: 3_000 });
    sender.enqueue(0, datagram(0));
    expect(sender.flush(0)).toHaveLength(1);
    expect(sender.flush(999)).toHaveLength(0);
    const resends = [1_000, 3_000, 6_000, 9_000].map((now) => sender.flush(now).length);
    expect(resends).toEqual([1, 1, 1, 1]);
    expect(sender.nextDueAt()).toBe(12_000);
    expect(sender.acknowledge(0, 9_500)).toBe(true);
    expect(sender.acknowledge(0, 9_500)).toBe(false);
    expect(sender.pending).toBe(0);
    expect(sender.nextDueAt()).toBeUndefined();
  });

  it("takes RTT samples only from packets that were not resent", () => {
    const rtt = new RttEstimator();
    const sender = new ReliableSender(rtt);
    sender.enqueue(0, datagram(0));
    sender.enqueue(1, datagram(1));
    sender.flush(0);
    sender.acknowledge(0, 50);
    expect(rtt.smoothedRttMs).toBe(50);
    sender.flush(5_000);
    sender.acknowledge(1, 5_010);
    expect(rtt.smoothedRttMs).toBe(50);
  });

  it("maps ack ids across the id wrap", () => {
    const sender = new ReliableSender(new RttEstimator());
    for (const index of [0xfffe, 0xffff, 0x10000, 0x10001]) sender.enqueue(index, datagram(index));
    sender.flush(0);
    expect(sender.acknowledge(0xffff, 1)).toBe(true);
    expect(sender.acknowledge(1, 1)).toBe(true);
    expect(sender.acknowledge(5, 1)).toBe(false);
    expect(sender.pending).toBe(2);
  });

  it("holds packets back beyond the in-flight window until the oldest is acked", () => {
    const sender = new ReliableSender(new RttEstimator(), { maxInFlight: 2 });
    for (let index = 0; index < 4; index++) sender.enqueue(index, datagram(index));
    expect(sender.flush(0).map((d) => d[0])).toEqual([0, 1]);
    sender.acknowledge(1, 1);
    expect(sender.flush(1)).toHaveLength(0);
    sender.acknowledge(0, 2);
    expect(sender.flush(2).map((d) => d[0])).toEqual([2, 3]);
    expect(sender.pending).toBe(2);
  });

  it("stalls after the give-up time without ack progress, counted from the first send", () => {
    const sender = new ReliableSender(new RttEstimator(), { giveUpMs: 10_000 });
    sender.enqueue(0, datagram(0));
    sender.enqueue(1, datagram(1));
    sender.flush(100);
    sender.acknowledge(0, 5_000);
    expect(sender.stalled(14_999)).toBe(false);
    expect(sender.stalled(15_000)).toBe(true);
    sender.clear();
    expect(sender.stalled(99_000)).toBe(false);
    expect(sender.pending).toBe(0);
  });
});
