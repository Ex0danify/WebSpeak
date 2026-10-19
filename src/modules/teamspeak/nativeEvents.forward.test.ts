import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { TeamSpeakTransportError, type ConnectionEventMap, type SessionView } from "../../lib/teamspeak/index.js";
import { forwardConnectionEvents } from "./nativeEvents.js";
import type { TeamSpeakBackendEvents } from "./teamSpeakBackend.js";

const SNAPSHOT = { channels: [], clients: [] };

function forward() {
  const source = Object.assign(new EventEmitter<ConnectionEventMap>(), { session: { snapshot: () => SNAPSHOT } as unknown as SessionView });
  const target = new EventEmitter<TeamSpeakBackendEvents>();
  const seen: [string, unknown][] = [];
  const types = ["directorySnapshot", "clientLeave", "kicked", "disconnected"] as const;
  for (const type of types) target.on(type, (payload: unknown) => seen.push([type, payload]));
  forwardConnectionEvents(source, target);
  return { source, seen };
}

const channel = { id: 2n } as never;
const client = { id: 7 } as never;

describe("forwardConnectionEvents", () => {
  it("follows channel edits, moves and subscriptions with a snapshot", () => {
    const { source, seen } = forward();
    source.emit("channelEdited", { type: "channelEdited", channel, changed: ["name"], invoker: undefined });
    source.emit("channelMoved", { type: "channelMoved", channel, fromParentId: 0n, invoker: undefined });
    source.emit("channelsSubscribed", { type: "channelsSubscribed", channels: [channel] });
    expect(seen).toEqual([
      ["directorySnapshot", SNAPSHOT],
      ["directorySnapshot", SNAPSHOT],
      ["directorySnapshot", SNAPSHOT],
    ]);
  });

  it("drops the clients of an unsubscribed channel before the snapshot", () => {
    const { source, seen } = forward();
    source.emit("channelsUnsubscribed", { type: "channelsUnsubscribed", channels: [channel], clients: [client] });
    expect(seen).toEqual([
      ["clientLeave", { id: 7, reasonID: 0, reasonMsg: "", targetID: 0 }],
      ["directorySnapshot", SNAPSHOT],
    ]);
  });

  it("reports a kick from the channel and a ban, but not our own leave", () => {
    const { source, seen } = forward();
    const left = (reasonId: number) =>
      source.emit("selfLeft", { type: "selfLeft", reasonId, reasonMessage: "", invoker: undefined, banTime: undefined });
    left(8);
    left(4);
    left(6);
    expect(seen.map(([type, payload]) => [type, (payload as { code: string }).code])).toEqual([
      ["kicked", "kicked"],
      ["kicked", "banned"],
    ]);
  });

  it("passes the transport error of a lost connection on", () => {
    const { source, seen } = forward();
    const error = new TeamSpeakTransportError("timeout", "server went quiet");
    source.emit("closed", { type: "closed", error });
    expect(seen).toEqual([["disconnected", error]]);
  });
});
