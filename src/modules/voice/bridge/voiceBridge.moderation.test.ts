import { describe, expect, it } from "vitest";
import { FakeTeamSpeakServer } from "../../../../test/support/fakeTsClient.js";
import { moderationLog } from "../../../../test/support/fakeTsFiles.js";
import { type Gateway, useGateway } from "../../../../test/support/gateway.js";
import { ask, errorOf, joinVoice } from "../../../../test/support/voice.js";

const gateways = useGateway();

const newServer = () =>
  new FakeTeamSpeakServer({
    channels: [
      { id: 1n, name: "Lobby" },
      { id: 2n, name: "Room A" },
    ],
  });
const group = (id: number, name: string) => ({
  id,
  name,
  isDefault: false,
  type: 1,
  sortId: id,
  iconId: 0,
  memberAddPower: 0,
  memberRemovePower: 0,
});

/** A session with the rights to moderate, a member bob in Room A, and one server and one channel group. */
async function admin(setup: (gateway: Gateway, bobId: number) => void = () => {}) {
  const gateway = await gateways.start({ ts: newServer() });
  gateway.ts.groups.server = [group(6, "Moderator")];
  gateway.ts.groups.channel = [group(5, "Channel Mod")];
  const bob = gateway.ts.addMember("bob", 2n);
  setup(gateway, bob.id);
  const session = await joinVoice(gateway, { nickname: "alice" });
  gateway.ts.adminUids.add(session.client.uid);
  return { gateway, bob, session };
}

describe("moderating a member", () => {
  it("kicks from the channel or the server with the trimmed reason and completes the request", async () => {
    const { bob, session } = await admin();
    expect(await ask(session, "kickClient", { clientId: bob.id, scope: "channel", message: "  calm down " }, "k1")).toEqual({
      type: "commandCompleted",
      requestId: "k1",
    });
    await ask(session, "kickClient", { clientId: bob.id, scope: "server" });
    expect(moderationLog(session.client)).toEqual([
      { action: "kick", clientId: bob.id, scope: "channel", reason: "calm down" },
      { action: "kick", clientId: bob.id, scope: "server", reason: "" },
    ]);
  });

  it("bans the member's identity, not the connection", async () => {
    const { bob, session } = await admin();
    await ask(session, "banClient", { clientId: bob.id, seconds: 3600, message: "spam" });
    expect(moderationLog(session.client)).toEqual([{ action: "ban", uid: "remote-bob", seconds: 3600, reason: "spam" }]);
  });

  it("refuses to kick or ban the session itself", async () => {
    const { session } = await admin();
    expect(errorOf(await ask(session, "kickClient", { clientId: session.id, scope: "server" }))).toMatchObject({
      code: "CANNOT_MODERATE_SELF",
    });
    expect(errorOf(await ask(session, "banClient", { clientId: session.id, seconds: 0 }))).toMatchObject({ code: "CANNOT_MODERATE_SELF" });
    expect(moderationLog(session.client)).toEqual([]);
  });

  it("answers CLIENT_NOT_FOUND for a member who is not in the directory, whatever the action", async () => {
    const { session } = await admin();
    const payloads = {
      kickClient: { scope: "server" },
      banClient: { seconds: 0 },
      setServerGroup: { groupId: 6, assigned: true },
      setChannelGroup: { groupId: 5 },
    };
    for (const [type, payload] of Object.entries(payloads)) {
      expect(errorOf(await ask(session, type as "kickClient", { clientId: 4242, ...payload })), type).toMatchObject({
        code: "CLIENT_NOT_FOUND",
      });
    }
    expect(moderationLog(session.client)).toEqual([]);
  });

  it("gives and takes a server group by the database id the directory knows", async () => {
    const { bob, session } = await admin((gateway, bobId) => {
      gateway.ts.members.get(bobId)!.databaseId = 77n;
    });
    await ask(session, "setServerGroup", { clientId: bob.id, groupId: 6, assigned: true });
    await ask(session, "setServerGroup", { clientId: bob.id, groupId: 6, assigned: false });
    expect(moderationLog(session.client)).toEqual([
      { action: "serverGroup", groupId: 6, databaseId: 77n, assigned: true },
      { action: "serverGroup", groupId: 6, databaseId: 77n, assigned: false },
    ]);
  });

  it("asks the server for the database id when the directory has none", async () => {
    const { bob, session } = await admin();
    await ask(session, "setServerGroup", { clientId: bob.id, groupId: 6, assigned: true });
    expect(moderationLog(session.client)).toEqual([
      { action: "serverGroup", groupId: 6, databaseId: BigInt(bob.id) + 1000n, assigned: true },
    ]);
  });

  it("sets a channel group in the channel the member is in", async () => {
    const { bob, session } = await admin();
    expect(await ask(session, "setChannelGroup", { clientId: bob.id, groupId: 5 }, "cg")).toEqual({
      type: "commandCompleted",
      requestId: "cg",
    });
    expect(moderationLog(session.client)).toEqual([
      { action: "channelGroup", groupId: 5, channelId: 2n, databaseId: BigInt(bob.id) + 1000n },
    ]);
  });

  it("answers GROUP_NOT_FOUND for a group the server did not list, and for the wrong kind of group", async () => {
    const { bob, session } = await admin();
    expect(errorOf(await ask(session, "setServerGroup", { clientId: bob.id, groupId: 99, assigned: true }))).toMatchObject({
      code: "GROUP_NOT_FOUND",
    });
    expect(errorOf(await ask(session, "setServerGroup", { clientId: bob.id, groupId: 5, assigned: true }))).toMatchObject({
      code: "GROUP_NOT_FOUND",
    });
    expect(errorOf(await ask(session, "setChannelGroup", { clientId: bob.id, groupId: 6 }))).toMatchObject({ code: "GROUP_NOT_FOUND" });
    expect(moderationLog(session.client)).toEqual([]);
  });

  it("passes the server's refusal on to a session without the rights", async () => {
    const gateway = await gateways.start({ ts: newServer() });
    const bob = gateway.ts.addMember("bob", 2n);
    const session = await joinVoice(gateway, { nickname: "alice" });
    expect(errorOf(await ask(session, "kickClient", { clientId: bob.id, scope: "server" }))).toMatchObject({ code: "PERMISSION_DENIED" });
    expect(moderationLog(session.client)).toEqual([]);
  });
});
