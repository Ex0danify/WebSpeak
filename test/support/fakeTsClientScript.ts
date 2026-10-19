import type { TeamSpeakProtocol } from "../../src/shared/teamSpeakProtocol.js";
import type { TSChatScope, TSDirectoryClient as DirectoryClientInfo } from "../../src/modules/teamspeak/teamSpeakClient.js";
import type { FakeTeamSpeakServer, FakeTSClient } from "./fakeTsClient.js";

/** Scripting pieces of the fake server: options, default channels and FakeRemoteMember (a member without a bridge session). */

export type FakeOperation =
  | "connect"
  | "switchChannel"
  | "moveClient"
  | "sendTextMessage"
  | "poke"
  | "setAway"
  | "setInputMuted"
  | "setOutputMuted"
  | "execCommand"
  | "avatar";

export interface FakeChannel {
  id: bigint;
  name: string;
  parentId?: bigint;
  /** Joining without this password fails with error id 781. */
  password?: string;
}

export interface FakeServerOptions {
  serverPassword?: string;
  channels?: FakeChannel[];
  /** Channel joined when the client asks for none, or an unknown one. Defaults to the first channel. */
  defaultChannelId?: bigint;
  /** When true every client may move others, otherwise only `adminUids`. */
  guestsCanMove?: boolean;
  protocol?: TeamSpeakProtocol;
  /** Delay applied to every async client operation. Zero means no timer at all. */
  latencyMs?: number;
  /** Connect without emitting `directorySnapshot`, as when the directory is unavailable. */
  withholdSnapshot?: boolean;
}

export const DEFAULT_FAKE_CHANNELS: FakeChannel[] = [
  { id: 1n, name: "Lobby" },
  { id: 2n, name: "Room A" },
  { id: 3n, name: "Room B" },
];

export class FakeRemoteMember {
  constructor(
    private readonly server: FakeTeamSpeakServer,
    readonly member: DirectoryClientInfo,
  ) {}

  get id(): number {
    return this.member.id;
  }
  say(scope: TSChatScope, message: string, targetId = 0n): void {
    this.server.deliverText(this.member, scope, message, targetId);
  }
  speak(data: Buffer, codec = 4): void {
    this.server.deliverVoice(this.id, data, codec);
  }
  poke(target: FakeTSClient, message: string): void {
    target.emit("poked", { invokerName: this.member.nickname, invokerUID: this.member.uid, invokerID: this.id, message });
  }
  moveTo(channelId: bigint): void {
    this.server.moveMember(this.id, channelId);
  }
  update(update: Partial<DirectoryClientInfo>): void {
    this.server.updateMember(this.id, update);
  }
  leave(reasonMsg = ""): void {
    this.server.removeMember(this.id, 8, reasonMsg);
  }
}
