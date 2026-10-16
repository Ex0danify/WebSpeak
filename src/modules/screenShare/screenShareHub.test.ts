import { describe, expect, it } from "vitest";
import type { Logger } from "../../shared/logger.js";
import { ScreenShareHub, type ScreenStreamRecord } from "./screenShareHub.js";
import type { ScreenShareParticipant } from "./screenShareTypes.js";

const logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => logger } as unknown as Logger;

function participant(id: string, clientId: number): ScreenShareParticipant {
  return {
    id,
    nickname: id,
    screenPeerId: `w-${id}`,
    target: { host: "ts.example", port: 9987 },
    tsClient: { getClientId: () => clientId, getChannelId: () => 1n, isConnected: () => true, sendProtocolCommand: async () => undefined },
    ws: { readyState: 1, send() {} },
    // Every viewer owns the biggest avatar the old roster allowed.
    members: new Map([[clientId, { avatar: "data:image/png;base64," + "A".repeat(128 * 1024 - 30) }]]),
  } as unknown as ScreenShareParticipant;
}

function setup(entries: ScreenShareParticipant[]) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const hub = new ScreenShareHub({
    getParticipant: (id) => byId.get(id),
    participants: () => byId.values(),
    getIceServers: () => [],
    logger,
  });
  const stream = {
    streamId: "s1",
    viewerEntryIds: new Set(entries.map((entry) => entry.id)),
    nativeViewerClids: new Set<number>(),
    viewerCount: 0,
  } as unknown as ScreenStreamRecord;
  return { hub, stream, byId };
}

describe("the screen share viewer roster", () => {
  it("names viewers by client id, so its size no longer depends on their avatars", () => {
    const { hub, stream } = setup(Array.from({ length: 8 }, (_, i) => participant(`v${i}`, 100 + i)));
    const message = hub.screenShareViewerCountMessage(stream);
    expect(message.viewers).toEqual(Array.from({ length: 8 }, (_, i) => ({ peerId: `w-v${i}`, nickname: `v${i}`, clientId: 100 + i })));
    expect(JSON.stringify(message).length).toBeLessThan(2 * 1024);
  });

  it("leaves out the client id of a viewer that has none yet", () => {
    const { hub, stream } = setup([participant("fresh", 0)]);
    expect(hub.describeScreenViewers(stream)).toEqual([{ peerId: "w-fresh", nickname: "fresh" }]);
  });

  it("drops a viewer that vanished without leaving, so the announced count follows the roster", () => {
    const { hub, stream, byId } = setup([participant("a", 1), participant("b", 2), participant("c", 3)]);
    stream.nativeViewerClids.add(900);
    byId.delete("b");

    const message = hub.screenShareViewerCountMessage(stream);
    expect(message.viewers).toHaveLength(2);
    expect(message.viewerCount).toBe(3); // two browsers and one native client
    expect(stream.viewerEntryIds.has("b")).toBe(false);
    expect(hub.screenShareViewerCount(stream)).toBe(3);
    expect(hub.describeScreenStream(stream).viewerCount).toBe(3);
  });
});
