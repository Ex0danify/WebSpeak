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
  const types = [
    "directorySnapshot",
    "clientLeave",
    "kicked",
    "disconnected",
    "permissionsChanged",
    "groupsChanged",
    "groupChanged",
  ] as const;
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

  it("tells that our permissions changed, without a snapshot", () => {
    const { source, seen } = forward();
    source.emit("permissionsUpdated", { type: "permissionsUpdated" });
    expect(seen).toEqual([["permissionsChanged", undefined]]);
  });

  it("tells that a server or channel group list changed, without a snapshot", () => {
    const { source, seen } = forward();
    source.emit("groupsUpdated", { type: "groupsUpdated", kind: "channel" });
    source.emit("groupsUpdated", { type: "groupsUpdated", kind: "server" });
    expect(seen).toEqual([
      ["groupsChanged", undefined],
      ["groupsChanged", undefined],
    ]);
  });

  it("tells who gave or took a group, and 0 with no name when the server did it", () => {
    const { source, seen } = forward();
    const base = { type: "groupChanged", kind: "server", groupId: 7, clientId: 6, assigned: true } as const;
    source.emit("groupChanged", { ...base, invoker: { id: 9, name: "Admin", uid: "admin=" } });
    source.emit("groupChanged", { ...base, invoker: undefined });
    expect(seen).toEqual([
      ["groupChanged", { kind: "server", groupId: 7, clientId: 6, assigned: true, invokerId: 9, invokerName: "Admin" }],
      ["groupChanged", { kind: "server", groupId: 7, clientId: 6, assigned: true, invokerId: 0, invokerName: "" }],
    ]);
  });

  it("passes the transport error of a lost connection on", () => {
    const { source, seen } = forward();
    const error = new TeamSpeakTransportError("timeout", "server went quiet");
    source.emit("closed", { type: "closed", error });
    expect(seen).toEqual([["disconnected", error]]);
  });
});
