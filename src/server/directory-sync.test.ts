import type { ChannelInfo, ClientInfo, DirectoryClientInfo } from "@echosixhiya/teamspeak-client";
import { describe, expect, it } from "vitest";
import { DirectorySynchronizer } from "./directory-sync.js";
import type { TSDirectorySnapshot } from "./ts-client.js";

function channel(id: number, name = `channel ${id}`): ChannelInfo {
  return { id: BigInt(id), name, description: "", parentID: 0n, order: 0n };
}

function client(id: number, extra: Partial<DirectoryClientInfo> = {}): DirectoryClientInfo {
  return { id, nickname: `user${id}`, uid: `uid${id}`, serverGroups: [], channelID: 1n, type: 0, ...extra };
}

function snapshot(clients: DirectoryClientInfo[], channels: ChannelInfo[] = [channel(1)]): TSDirectorySnapshot {
  return { channels, clients };
}

function ids(sync: DirectorySynchronizer): number[] {
  return (sync.getSnapshot()?.clients ?? []).map((entry) => entry.id).sort((a, b) => a - b);
}

describe("DirectorySynchronizer snapshots", () => {
  it("is not ready and has no snapshot until one is applied", () => {
    const sync = new DirectorySynchronizer();
    expect(sync.ready).toBe(false);
    expect(sync.getSnapshot()).toBeNull();
  });

  it("returns the channels and clients of the applied snapshot", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([client(1), client(2)], [channel(1), channel(2)]));
    expect(sync.ready).toBe(true);
    expect(sync.getSnapshot()).toEqual(snapshot([client(1), client(2)], [channel(1), channel(2)]));
  });

  it("hands out copies: changing a returned snapshot does not change the state", () => {
    const sync = new DirectorySynchronizer();
    const input = snapshot([client(1)]);
    sync.applySnapshot(input);
    input.channels.push(channel(9));
    const first = sync.getSnapshot()!;
    first.channels.length = 0;
    first.clients.length = 0;
    expect(sync.getSnapshot()!.channels).toHaveLength(1);
    expect(ids(sync)).toEqual([1]);
  });

  it("keeps clients of an earlier partial snapshot when a later one lists others", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([client(1)]));
    sync.applySnapshot(snapshot([client(2)]));
    expect(ids(sync)).toEqual([1, 2]);
  });

  it("merges fields of a client seen twice, the later snapshot winning", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([client(1, { nickname: "old", away: true })]));
    sync.applySnapshot(snapshot([client(1, { nickname: "new", channelID: 5n })]));
    expect(sync.getSnapshot()!.clients).toEqual([client(1, { nickname: "new", channelID: 5n, away: true })]);
  });

  it("takes the channel list of the latest snapshot as is", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([], [channel(1), channel(2)]));
    sync.applySnapshot(snapshot([], [channel(3)]));
    expect(sync.getSnapshot()!.channels.map((entry) => entry.id)).toEqual([3n]);
  });
});

describe("DirectorySynchronizer deltas", () => {
  it("applies enter, update, move and leave once a snapshot exists", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([client(1)]));
    sync.applyClientEnter(client(2));
    sync.applyClientUpdated(client(2, { nickname: "renamed", inputMuted: true }));
    sync.applyClientMoved(2, 7n);
    expect(sync.getSnapshot()!.clients.find((entry) => entry.id === 2)).toEqual(client(2, { nickname: "renamed", inputMuted: true, channelID: 7n }));
    sync.applyClientLeave(1);
    expect(ids(sync)).toEqual([2]);
  });

  it("ignores a move for a client it does not know", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([client(1)]));
    sync.applyClientMoved(99, 7n);
    expect(sync.getSnapshot()!.clients).toEqual([client(1)]);
  });

  it("ignores a leave for a client it does not know", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([client(1)]));
    sync.applyClientLeave(99);
    expect(sync.getSnapshot()!.clients).toEqual([client(1)]);
  });

  it("adds a client that is first seen as an update", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([]));
    sync.applyClientUpdated(client(4));
    expect(ids(sync)).toEqual([4]);
  });

  it("queues events received before the snapshot and replays them in order after it (handshake race)", () => {
    const sync = new DirectorySynchronizer();
    sync.applyClientEnter(client(2));
    sync.applyClientMoved(2, 5n);
    sync.applyClientLeave(3);
    expect(sync.ready).toBe(false);
    expect(sync.getSnapshot()).toBeNull();
    sync.applySnapshot(snapshot([client(3)]));
    // 3 was in the snapshot but its leave was queued earlier, so it is gone; 2 entered and moved.
    expect(sync.getSnapshot()!.clients).toEqual([client(2, { channelID: 5n })]);
  });

  it("lets a queued leave win over the same client in the snapshot, and a queued enter survive it", () => {
    const sync = new DirectorySynchronizer();
    sync.applyClientLeave(1);
    sync.applyClientEnter(client(2));
    sync.applySnapshot(snapshot([client(1)]));
    expect(ids(sync)).toEqual([2]);
  });

  it("lets an explicit leave remove a client that an earlier snapshot listed", () => {
    const sync = new DirectorySynchronizer();
    sync.applySnapshot(snapshot([client(1)]));
    sync.applyClientLeave(1);
    sync.applySnapshot(snapshot([client(2)]));
    expect(ids(sync)).toEqual([2]);
  });

  it("queues at most 4096 events before the snapshot and drops the rest (current limit)", () => {
    const sync = new DirectorySynchronizer();
    for (let id = 1; id <= 4100; id += 1) sync.applyClientEnter(client(id) as ClientInfo);
    sync.applySnapshot(snapshot([]));
    const seen = ids(sync);
    expect(seen).toHaveLength(4096);
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(4096);
  });

  it("does not replay the queue twice", () => {
    const sync = new DirectorySynchronizer();
    sync.applyClientEnter(client(2));
    sync.applySnapshot(snapshot([]));
    sync.applyClientLeave(2);
    sync.applySnapshot(snapshot([]));
    expect(ids(sync)).toEqual([]);
  });
});

describe("DirectorySynchronizer.clear", () => {
  it("forgets the snapshot, the clients and any queued events", () => {
    const sync = new DirectorySynchronizer();
    sync.applyClientEnter(client(5));
    sync.applySnapshot(snapshot([client(1)]));
    sync.applyClientEnter(client(6));
    sync.clear();
    expect(sync.ready).toBe(false);
    expect(sync.getSnapshot()).toBeNull();
    sync.applyClientEnter(client(7));
    sync.clear();
    sync.applySnapshot(snapshot([client(2)]));
    expect(ids(sync)).toEqual([2]);
  });
});
