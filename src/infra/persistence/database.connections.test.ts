import { describe, expect, it } from "vitest";
import { useDatabaseFixture } from "../../../test/support/database.js";

const fx = useDatabaseFixture();

const start = (id: string, overrides = {}) => ({
  id,
  nickname: `nick-${id}`,
  clientIp: "10.0.0.1",
  target: "ts.test:9987",
  relayName: null,
  relayTarget: null,
  ...overrides,
});
const ended = { reason: null, failureDetail: null, durationSeconds: 60, audio: null };

describe("connection records", () => {
  it("follows a session from connecting through active to disconnected", () => {
    const database = fx.open();
    database.beginConnection(start("w-1", { relayName: "Relay", relayTarget: "relay.test:39087" }));
    expect(database.getConnection("w-1")).toMatchObject({ status: "connecting", connectedAt: null, relayName: "Relay" });
    database.markConnectionConnected("w-1");
    expect(database.getConnection("w-1")).toMatchObject({ status: "active", disconnectedAt: null, durationSeconds: expect.any(Number) });
    const audio = { talkSeconds: 12, framesSent: 600, framesReceived: 900, droppedFrames: 3, sendErrors: 0 };
    database.finishConnection("w-1", { ...ended, audio });
    expect(database.getConnection("w-1")).toMatchObject({ status: "disconnected", durationSeconds: 60, reason: null, audio });
  });

  it("calls a session that never connected failed, with its reason and no duration", () => {
    const database = fx.open();
    database.beginConnection(start("w-1"));
    database.finishConnection("w-1", { reason: "BANNED", failureDetail: "you are banned", durationSeconds: 2, audio: null });
    expect(database.getConnection("w-1")).toMatchObject({
      status: "failed",
      reason: "BANNED",
      failureDetail: "you are banned",
      durationSeconds: null,
      audio: null,
    });
  });

  it("lists the newest first with the total, and filters by status and search", () => {
    const database = fx.open();
    for (const [id, nickname] of [
      ["w-1", "olga"],
      ["w-2", "fred"],
      ["w-3", "lena"],
    ] as const) {
      database.beginConnection(start(id, { nickname, clientIp: id === "w-2" ? "192.168.1.5" : "10.0.0.1" }));
    }
    database.markConnectionConnected("w-1");
    database.finishConnection("w-1", ended);
    database.finishConnection("w-2", { ...ended, reason: "CONNECTION_FAILED" });
    expect(database.listConnections({ limit: 2, offset: 0 })).toMatchObject({ total: 3, records: [{ id: "w-3" }, { id: "w-2" }] });
    expect(database.listConnections({ limit: 10, offset: 2 }).records.map((record) => record.id)).toEqual(["w-1"]);
    expect(database.listConnections({ limit: 10, offset: 0, statuses: ["failed"] }).records.map((record) => record.id)).toEqual(["w-2"]);
    expect(database.listConnections({ limit: 10, offset: 0, statuses: [] }).total).toBe(0);
    expect(database.listConnections({ limit: 10, offset: 0, search: "192.168" }).records.map((record) => record.id)).toEqual(["w-2"]);
    expect(database.listConnections({ limit: 10, offset: 0, search: "50%" }).total).toBe(0);
  });

  it("closes the sessions a gone gateway left open", () => {
    const database = fx.open();
    database.beginConnection(start("w-wait"));
    database.beginConnection(start("w-live"));
    database.markConnectionConnected("w-live");
    expect(database.closeOpenConnections()).toBe(2);
    expect(database.getConnection("w-wait")).toMatchObject({ status: "failed", reason: "GATEWAY_RESTARTED", durationSeconds: null });
    expect(database.getConnection("w-live")).toMatchObject({ status: "disconnected", reason: "GATEWAY_RESTARTED" });
    expect(database.closeOpenConnections()).toBe(0);
  });
});
