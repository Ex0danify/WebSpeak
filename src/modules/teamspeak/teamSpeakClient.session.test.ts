import { EventEmitter } from "node:events";
import type { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { Logger } from "../../shared/logger.js";
import { TSClient } from "./teamSpeakClient.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return logger;
  },
};

const avatarRows = [{ client_unique_identifier: "member", client_flag_avatar: "marker", client_base64HashClientUID: "abcdefgh" }];

class SdkStub extends EventEmitter {
  commands: string[] = [];
  noWait: string[] = [];
  onExec: (command: string) => Promise<void> = async () => undefined;
  metadata: () => Promise<typeof avatarRows> = async () => avatarRows;
  async execCommand(command: string) {
    this.commands.push(command);
    await this.onExec(command);
  }
  async sendCommandNoWait(command: string) {
    this.noWait.push(command);
  }
  execCommandWithResponse() {
    return this.metadata();
  }
  async fileTransferInitDownload() {
    return { size: 6n };
  }
  async downloadFileData(_host: string, _transfer: unknown, destination: Writable) {
    destination.write(Buffer.from("GIF89a"));
  }
  clientID() {
    return 5;
  }
  channelID() {
    return 1n;
  }
}

type Internals = { client: SdkStub | null; connected: boolean };

function fixture() {
  const client = new TSClient({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test" }, logger);
  const sdk = new SdkStub();
  const internals = client as unknown as Internals;
  internals.client = sdk;
  internals.connected = true;
  return { client, sdk, internals };
}

describe("TSClient output mute", () => {
  it("sends the deafened flag once per change", async () => {
    const { client, sdk } = fixture();
    await client.setOutputMuted(true);
    await client.setOutputMuted(true);
    await client.setOutputMuted(false);
    expect(sdk.commands).toEqual(["clientupdate client_output_muted=1", "clientupdate client_output_muted=0"]);
  });

  it("rejects before the session is ready", async () => {
    const client = new TSClient({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test" }, logger);
    await expect(client.setOutputMuted(true)).rejects.toThrow("not ready");
  });
});

describe("TSClient input mute and accompaniment", () => {
  it("sends a plain mute once", async () => {
    const { client, sdk } = fixture();
    await client.setInputMuted(true);
    await client.setInputMuted(true);
    expect(sdk.commands).toEqual(["clientupdate client_input_muted=1"]);
  });

  it("keeps the input unmuted while accompaniment plays, so the shared audio stays audible", async () => {
    const { client, sdk } = fixture();
    await client.setInputMuted(true);
    await client.setAccompanimentActive(true);
    expect(sdk.commands.at(-1)).toBe("clientupdate client_input_muted=0");
    await client.setInputMuted(true);
    expect(sdk.commands).toHaveLength(2);
    await client.setAccompanimentActive(false);
    expect(sdk.commands.at(-1)).toBe("clientupdate client_input_muted=1");
  });

  it("mutes straight away when accompaniment was on before the mute", async () => {
    const { client, sdk } = fixture();
    await client.setAccompanimentActive(true);
    await client.setInputMuted(true);
    expect(sdk.commands).toEqual(["clientupdate client_input_muted=0"]);
  });

  it("rejects before the session is ready", async () => {
    const client = new TSClient({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test" }, logger);
    await expect(client.setAccompanimentActive(true)).rejects.toThrow("not ready");
  });
});

describe("TSClient text messages", () => {
  it("waits for the server's answer, so a refusal reaches the sender", async () => {
    const { client, sdk } = fixture();
    await client.sendTextMessage("private", "hi there", 9n);
    expect(sdk.commands).toEqual(["sendtextmessage targetmode=1 target=9 msg=hi\\sthere"]);
    expect(sdk.noWait).toEqual([]);
    sdk.onExec = async () => {
      throw new Error("invalid clientID");
    };
    await expect(client.sendTextMessage("private", "hi", 9n)).rejects.toThrow("invalid clientID");
  });

  it("uses target mode 2 for the channel and 3 for the server", async () => {
    const { client, sdk } = fixture();
    await client.sendTextMessage("channel", "a", 4n);
    await client.sendTextMessage("server", "b");
    expect(sdk.commands).toEqual(["sendtextmessage targetmode=2 target=4 msg=a", "sendtextmessage targetmode=3 target=0 msg=b"]);
  });
});

describe("TSClient protocol commands", () => {
  it("waits for the acknowledgement of stream cleanup", async () => {
    const { client, sdk } = fixture();
    await client.sendProtocolCommand("stopstream id=1 reason=1");
    await client.sendProtocolCommand("removeclientfromstream id=1 clid=9");
    expect(sdk.noWait).toEqual([]);
    expect(sdk.commands).toEqual(["stopstream id=1 reason=1", "removeclientfromstream id=1 clid=9"]);
  });

  it("rejects a cleanup the server refused", async () => {
    const { client, sdk } = fixture();
    sdk.onExec = async () => {
      throw new Error("TeamSpeak server error: invalid stream (id=1)");
    };
    await expect(client.sendProtocolCommand("stopstream id=1")).rejects.toThrow("invalid stream");
  });

  it("does not wait for the answer of other stream commands", async () => {
    const { client, sdk } = fixture();
    await client.sendProtocolCommand("requeststreaminfo clid=3");
    expect(sdk.commands).toEqual([]);
    expect(sdk.noWait).toEqual(["requeststreaminfo clid=3"]);
  });
});

describe("TSClient avatar lookup", () => {
  it("returns the avatar of the current connection", async () => {
    const { client } = fixture();
    expect((await client.getClientAvatar(2, "member"))?.cacheKey).toBe("marker");
  });

  it("returns null when the lookup finishes after a reconnect", async () => {
    const { client, sdk, internals } = fixture();
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => {
      started = resolve;
    });
    sdk.metadata = () =>
      new Promise((resolve) => {
        release = () => resolve(avatarRows);
        started();
      });
    const pending = client.getClientAvatar(2, "member");
    await inFlight;
    internals.client = new SdkStub();
    release();
    expect(await pending).toBeNull();
  });
});
