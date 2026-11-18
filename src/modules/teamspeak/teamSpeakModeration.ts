import {
  banUid,
  clientInfo,
  clientKick,
  serverGroupAddClient,
  serverGroupDelClient,
  setClientChannelGroup,
  type KickScope,
} from "../../lib/teamspeak/index.js";
import type { TeamSpeakBackend } from "./teamSpeakBackend.js";

/** What an administrator does to other clients. The server decides whether the session may, a refusal rejects. */
export class TeamSpeakModeration {
  constructor(private readonly backend: TeamSpeakBackend) {}

  /** A channel kick sends the client to the default channel, a server kick disconnects it. */
  async kick(clientId: number, scope: KickScope, reason = ""): Promise<void> {
    await this.backend.command(clientKick(clientId, scope, reason));
  }

  /** The server disconnects the client with the ban and refuses its identity afterwards. */
  async ban(uid: string, seconds: number, reason = ""): Promise<void> {
    await this.backend.command(banUid(uid, seconds, reason));
  }

  async setServerGroup(groupId: number, databaseId: bigint, assigned: boolean): Promise<void> {
    const build = assigned ? serverGroupAddClient : serverGroupDelClient;
    await this.backend.command(build(groupId, databaseId));
  }

  async setChannelGroup(groupId: number, channelId: bigint, databaseId: bigint): Promise<void> {
    await this.backend.command(setClientChannelGroup(groupId, channelId, databaseId));
  }

  /** Asks the server for it, for a client the directory has no database id of. */
  async databaseId(clientId: number): Promise<bigint | undefined> {
    const [row] = await this.backend.command(clientInfo(clientId));
    const id = row?.client_database_id ?? "";
    return /^\d+$/.test(id) ? BigInt(id) : undefined;
  }
}
