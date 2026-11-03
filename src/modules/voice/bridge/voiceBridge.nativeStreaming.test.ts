import { describe, expect, it } from "vitest";
import { useGateway } from "../../../../test/support/gateway.js";
import { ask, joinVoice, type VoiceSession } from "../../../../test/support/voice.js";
import type { JsonMessage } from "../../../../test/support/wsClient.js";

const gateways = useGateway();

type ListedChannel = { members?: { id: number; streaming?: boolean }[] };

const streamingIn = (message: JsonMessage, clientId: number) =>
  (message.channels as ListedChannel[]).flatMap((channel) => channel.members ?? []).find((member) => member.id === clientId)?.streaming;

/** The next channel list in which `clientId` has the given streaming state. */
const channelListWith = (session: VoiceSession, clientId: number, streaming: boolean | undefined, after: number) =>
  session.socket.waitForMessage((message) => message.type === "channelList" && streamingIn(message, clientId) === streaming, { after });

describe("a member who shares a screen in another channel", () => {
  it("is flagged in the channel list while the share runs, and unflagged once it ends", async () => {
    const gateway = await gateways.start();
    const sharer = gateway.ts.addMember("sharer", 3n);
    const viewer = await joinVoice(gateway, { nickname: "viewer" });

    const started = viewer.socket.mark();
    sharer.update({ streaming: true });
    await channelListWith(viewer, sharer.id, true, started);

    const stopped = viewer.socket.mark();
    sharer.update({ streaming: false });
    await channelListWith(viewer, sharer.id, false, stopped);
  });

  it("is flagged from the start when the share was already running at connect", async () => {
    const gateway = await gateways.start();
    const sharer = gateway.ts.addMember("sharer", 3n);
    sharer.update({ streaming: true });
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    const list = viewer.socket.messages.filter((message) => message.type === "channelList").at(-1)!;
    expect(streamingIn(list, sharer.id)).toBe(true);
  });

  it("loses the native stream record when the flag drops without a stop notification", async () => {
    const gateway = await gateways.start();
    const sharer = gateway.ts.addMember("sharer");
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    sharer.update({ streaming: true });
    const mark = viewer.socket.mark();
    viewer.client.emit("rawNotification", {
      name: "notifystreamstarted",
      params: { id: "ts-gone", clid: String(sharer.id), name: "Gone soon", audio: "0" },
    });
    await viewer.socket.waitForMessage("screenShareStarted", { after: mark });

    sharer.update({ streaming: false });
    const stopped = await viewer.socket.waitForMessage("screenShareStopped", { after: mark });
    expect(stopped).toMatchObject({ streamId: "ts-gone" });
  });
});

describe("a share that is already running when the session changes channel", () => {
  it("is asked for once the session arrives, because only that channel is told", async () => {
    const gateway = await gateways.start();
    const sharer = gateway.ts.addMember("sharer", 3n);
    const bystander = gateway.ts.addMember("bystander", 3n);
    sharer.update({ streaming: true });
    gateway.ts.onProtocolCommand = (command, client) => {
      // Like TeamSpeak, only answer a client that is in the sharer's channel.
      if (command === `requeststreaminfo clid=${sharer.id}` && client.getChannelId() === 3n)
        client.emit("rawNotification", {
          name: "notifystreaminfo",
          params: { id: "ts-running", clid: String(sharer.id), name: "Running", audio: "0" },
        });
    };
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    const before = viewer.client.protocolCommands.length;
    const mark = viewer.socket.mark();

    await ask(viewer, "switchChannel", { channelId: "3" });
    const card = await viewer.socket.waitForMessage("screenShareStarted", { after: mark });

    expect(card).toMatchObject({ stream: { streamId: "ts-running", source: "teamspeak", ownerClientId: sharer.id } });
    const asked = viewer.client.protocolCommands.slice(before);
    expect(asked).toContain(`requeststreaminfo clid=${sharer.id}`);
    expect(asked).not.toContain(`requeststreaminfo clid=${bystander.id}`);
  });

  it("is asked for when the sharer walks into the session's channel", async () => {
    const gateway = await gateways.start();
    const sharer = gateway.ts.addMember("sharer", 3n);
    sharer.update({ streaming: true });
    const viewer = await joinVoice(gateway, { nickname: "viewer" });
    const before = viewer.client.protocolCommands.length;

    const mark = viewer.socket.mark();
    sharer.moveTo(1n);
    await viewer.socket.waitForMessage((message) => message.type === "channelList", { after: mark });

    expect(viewer.client.protocolCommands.slice(before)).toContain(`requeststreaminfo clid=${sharer.id}`);
  });
});
