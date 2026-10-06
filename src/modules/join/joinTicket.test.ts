import { describe, expect, it } from "vitest";
import { JoinTicketStore, type JoinTicketPayload } from "./joinTicket.js";

function payload(nickname = "alice"): JoinTicketPayload {
  return { target: { host: "ts.example", port: 9987 }, serverPassword: "", nickname };
}

describe("JoinTicketStore", () => {
  it("returns the stored payload for a fresh token", () => {
    const store = new JoinTicketStore();
    const token = store.create(payload(), 0);
    expect(store.consume(token, 1)).toEqual(payload());
  });

  it("is single use: the second consume returns null (replay)", () => {
    const store = new JoinTicketStore();
    const token = store.create(payload(), 0);
    expect(store.consume(token, 1)).not.toBeNull();
    expect(store.consume(token, 2)).toBeNull();
  });

  it("rejects an unknown token", () => {
    expect(new JoinTicketStore().consume("nope")).toBeNull();
  });

  it("expires after the ttl, exactly at the boundary", () => {
    const store = new JoinTicketStore(1_000);
    const live = store.create(payload("live"), 0);
    const dead = store.create(payload("dead"), 0);
    expect(store.consume(live, 999)?.nickname).toBe("live");
    expect(store.consume(dead, 1_000)).toBeNull();
  });

  it("burns an expired ticket on the failed consume", () => {
    const store = new JoinTicketStore(1_000);
    const token = store.create(payload(), 0);
    expect(store.consume(token, 5_000)).toBeNull();
    expect(store.consume(token, 0)).toBeNull();
  });

  it("uses a 30 s ttl by default", () => {
    const store = new JoinTicketStore();
    const a = store.create(payload(), 0);
    const b = store.create(payload(), 0);
    expect(store.consume(a, 29_999)).not.toBeNull();
    expect(store.consume(b, 30_000)).toBeNull();
  });

  it("issues distinct, url-safe tokens", () => {
    const store = new JoinTicketStore();
    const tokens = new Set(Array.from({ length: 50 }, () => store.create(payload(), 0)));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("evicts the oldest ticket when the store is full", () => {
    const store = new JoinTicketStore(60_000, 2);
    const first = store.create(payload("first"), 0);
    const second = store.create(payload("second"), 1);
    const third = store.create(payload("third"), 2);
    expect(store.consume(first, 3)).toBeNull();
    expect(store.consume(second, 3)?.nickname).toBe("second");
    expect(store.consume(third, 3)?.nickname).toBe("third");
  });

  it("prunes expired tickets before evicting live ones", () => {
    const store = new JoinTicketStore(1_000, 2);
    store.create(payload("stale"), 0);
    const live = store.create(payload("live"), 900);
    store.create(payload("new"), 1_500); // "stale" expired, so "live" stays
    expect(store.consume(live, 1_600)?.nickname).toBe("live");
  });
});
