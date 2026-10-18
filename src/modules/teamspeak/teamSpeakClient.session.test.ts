import { describe, expect, it } from "vitest";
import { FakeBackend, fakeBackends, silentLogger } from "../../../test/support/fakeTsBackend.js";
import { TSClient } from "./teamSpeakClient.js";

async function fixture() {
  const { backends, factory } = fakeBackends();
  const client = new TSClient({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test" }, silentLogger, factory);
  await client.connect();
  const sdk = backends[0]!;
  // Connect-time commands (subscribe) are not what these tests look at.
  sdk.commands.length = 0;
  return { client, sdk, backends };
}

describe("TSClient output mute", () => {
  it("sends the deafened flag once per change", async () => {
    const { client, sdk } = await fixture();
    await client.setOutputMuted(true);
    await client.setOutputMuted(true);
    await client.setOutputMuted(false);
    expect(sdk.commands).toEqual(["clientupdate client_output_muted=1", "clientupdate client_output_muted=0"]);
  });

  it("rejects before the session is ready", async () => {
    const client = new TSClient({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test" }, silentLogger);
    await expect(client.setOutputMuted(true)).rejects.toThrow("not ready");
  });
});

describe("TSClient input mute and accompaniment", () => {
  it("sends a plain mute once", async () => {
    const { client, sdk } = await fixture();
    await client.setInputMuted(true);
    await client.setInputMuted(true);
    expect(sdk.commands).toEqual(["clientupdate client_input_muted=1"]);
  });

  it("keeps the input unmuted while accompaniment plays, so the shared audio stays audible", async () => {
    const { client, sdk } = await fixture();
    await client.setInputMuted(true);
    await client.setAccompanimentActive(true);
    expect(sdk.commands.at(-1)).toBe("clientupdate client_input_muted=0");
    await client.setInputMuted(true);
    expect(sdk.commands).toHaveLength(2);
    await client.setAccompanimentActive(false);
    expect(sdk.commands.at(-1)).toBe("clientupdate client_input_muted=1");
  });

  it("mutes straight away when accompaniment was on before the mute", async () => {
    const { client, sdk } = await fixture();
    await client.setAccompanimentActive(true);
    await client.setInputMuted(true);
    expect(sdk.commands).toEqual(["clientupdate client_input_muted=0"]);
  });

  it("rejects before the session is ready", async () => {
    const client = new TSClient({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test" }, silentLogger);
    await expect(client.setAccompanimentActive(true)).rejects.toThrow("not ready");
  });
});

describe("TSClient text messages", () => {
  it("waits for the server's answer, so a refusal reaches the sender", async () => {
    const { client, sdk } = await fixture();
    await client.sendTextMessage("private", "hi there", 9n);
    expect(sdk.commands).toEqual(["sendtextmessage targetmode=1 target=9 msg=hi\\sthere"]);
    expect(sdk.sent).toEqual([]);
    sdk.onCommand = async () => {
      throw new Error("invalid clientID");
    };
    await expect(client.sendTextMessage("private", "hi", 9n)).rejects.toThrow("invalid clientID");
  });

  it("uses target mode 2 for the channel and 3 for the server", async () => {
    const { client, sdk } = await fixture();
    await client.sendTextMessage("channel", "a", 4n);
    await client.sendTextMessage("server", "b");
    expect(sdk.commands).toEqual(["sendtextmessage targetmode=2 target=4 msg=a", "sendtextmessage targetmode=3 target=0 msg=b"]);
  });
});

describe("TSClient protocol commands", () => {
  it("waits for the acknowledgement of stream cleanup", async () => {
    const { client, sdk } = await fixture();
    await client.sendProtocolCommand("stopstream id=1 reason=1");
    await client.sendProtocolCommand("removeclientfromstream id=1 clid=9");
    expect(sdk.sent).toEqual([]);
    expect(sdk.commands).toEqual(["stopstream id=1 reason=1", "removeclientfromstream id=1 clid=9"]);
  });

  it("rejects a cleanup the server refused", async () => {
    const { client, sdk } = await fixture();
    sdk.onCommand = async () => {
      throw new Error("TeamSpeak server error: invalid stream (id=1)");
    };
    await expect(client.sendProtocolCommand("stopstream id=1")).rejects.toThrow("invalid stream");
  });

  it("does not wait for the answer of other stream commands", async () => {
    const { client, sdk } = await fixture();
    await client.sendProtocolCommand("requeststreaminfo clid=3");
    expect(sdk.commands).toEqual([]);
    expect(sdk.sent).toEqual(["requeststreaminfo clid=3"]);
  });
});

describe("TSClient avatar lookup", () => {
  it("returns the avatar of the current connection", async () => {
    const { client, sdk } = await fixture();
    sdk.onAvatar = async (clientId, expectedUid) =>
      clientId === 2 && expectedUid === "member" ? { cacheKey: "marker", data: Buffer.from("GIF89a") } : null;
    expect((await client.getClientAvatar(2, "member"))?.cacheKey).toBe("marker");
  });

  it("returns null when the lookup finishes after a reconnect", async () => {
    const { client, sdk, backends } = await fixture();
    let release: () => void = () => undefined;
    sdk.onAvatar = () => new Promise((resolve) => (release = () => resolve({ cacheKey: "marker", data: Buffer.from("GIF89a") })));
    const pending = client.getClientAvatar(2, "member");
    await client.disconnect();
    await client.connect();
    expect(backends).toHaveLength(2);
    release();
    expect(await pending).toBeNull();
  });

  it("returns null instead of the error of a retired connection", async () => {
    const { client, sdk } = await fixture();
    let fail: () => void = () => undefined;
    sdk.onAvatar = () => new Promise((_resolve, reject) => (fail = () => reject(new Error("connection closed"))));
    const pending = client.getClientAvatar(2, "member");
    await client.disconnect();
    fail();
    expect(await pending).toBeNull();
  });
});

describe("TSClient commands", () => {
  it("escapes every special character of a chat message, tabs included", async () => {
    const { client, sdk } = await fixture();
    await client.sendTextMessage("channel", "a\tb|c d", 4n);
    expect(sdk.commands).toEqual(["sendtextmessage targetmode=2 target=4 msg=a\\tb\\pc\\sd"]);
  });

  it("sends away state and message in one clientupdate", async () => {
    const { client, sdk } = await fixture();
    await client.setAway(true, "back soon");
    await client.setAway(false);
    expect(sdk.commands).toEqual([
      "clientupdate client_away=1 client_away_message=back\\ssoon",
      "clientupdate client_away=0 client_away_message=",
    ]);
  });

  it("hashes a channel password", async () => {
    const { client, sdk } = await fixture();
    await client.switchChannel(7n, "secret");
    expect(sdk.commands).toEqual(["clientmove clid=56 cid=7 cpw=5en6G6MezRroT3XKqkdPOmY\\/BfQ="]);
  });

  it("reads the own channel from the session instead of a cast", async () => {
    const { client, sdk } = await fixture();
    sdk.channel = 9n;
    expect(client.getChannelId()).toBe(9n);
  });

  it("moves back to the channel it was in after a reconnect", async () => {
    const { client, backends } = await fixture();
    await client.switchChannel(7n);
    await client.disconnect();
    await client.connect();
    expect(backends[1]!.commands).toEqual(["channelsubscribeall", "clientmove clid=56 cid=7"]);
  });

  it("subscribes to every channel after the welcome", async () => {
    const { backends, factory } = fakeBackends();
    const client = new TSClient({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test" }, silentLogger, factory);
    await client.connect();
    expect(backends[0]!.commands).toEqual(["channelsubscribeall"]);
    expect(backends[0]).toBeInstanceOf(FakeBackend);
  });
});
