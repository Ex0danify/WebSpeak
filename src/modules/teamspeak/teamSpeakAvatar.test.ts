import { describe, expect, it, vi } from "vitest";
import type { Writable } from "node:stream";
import { MAX_CLIENT_AVATAR_BYTES, loadClientAvatar, type TeamSpeakAvatarClient } from "./teamSpeakAvatar.js";

const FILE_KEY = "abcdEFGH12345678";

function fakeClient(opts: { rows?: Record<string, string>[]; size?: bigint; body?: Buffer } = {}) {
  const rows = opts.rows ?? [{ client_unique_identifier: "uid-1", client_flag_avatar: "marker", client_base64HashClientUID: FILE_KEY }];
  const body = opts.body ?? Buffer.from("png-bytes");
  const client = {
    execCommandWithResponse: vi.fn(async () => rows),
    fileTransferInitDownload: vi.fn(async () => ({ size: opts.size ?? BigInt(body.length) })),
    downloadFileData: vi.fn(async (_host: string, _transfer: unknown, dest: Writable) => {
      dest.write(body);
      dest.end();
    }),
  };
  return client as unknown as TeamSpeakAvatarClient & typeof client;
}

describe("loadClientAvatar", () => {
  it("downloads the avatar file named by clientinfo", async () => {
    const client = fakeClient();
    const avatar = await loadClientAvatar(client, "ts.example", 7, "uid-1");
    expect(avatar).toEqual({ cacheKey: "marker", data: Buffer.from("png-bytes") });
    expect(client.execCommandWithResponse).toHaveBeenCalledWith("clientinfo clid=7", 5_000);
    expect(client.fileTransferInitDownload).toHaveBeenCalledWith(0n, `/avatar_${FILE_KEY}`, "");
    expect(client.downloadFileData).toHaveBeenCalledWith("ts.example", expect.anything(), expect.anything());
  });

  it("rejects an invalid client id", async () => {
    await expect(loadClientAvatar(fakeClient(), "h", 0)).rejects.toThrow("Invalid TeamSpeak client id");
    await expect(loadClientAvatar(fakeClient(), "h", 65536)).rejects.toThrow("Invalid TeamSpeak client id");
  });

  it("returns null when the uid does not match or no avatar is set", async () => {
    expect(await loadClientAvatar(fakeClient(), "h", 7, "other")).toBeNull();
    expect(await loadClientAvatar(fakeClient({ rows: [{ client_unique_identifier: "uid-1" }] }), "h", 7)).toBeNull();
  });

  it("returns null for an unsafe avatar file key or empty marker", async () => {
    const bad = fakeClient({ rows: [{ client_flag_avatar: "m", client_base64HashClientUID: "../etc/passwd" }] });
    expect(await loadClientAvatar(bad, "h", 7)).toBeNull();
    expect(bad.fileTransferInitDownload).not.toHaveBeenCalled();
    expect(await loadClientAvatar(fakeClient({ rows: [{ client_flag_avatar: " ", client_base64HashClientUID: FILE_KEY }] }), "h", 7)).toBeNull();
  });

  it("returns null for an oversized or empty transfer without downloading", async () => {
    for (const size of [0n, BigInt(MAX_CLIENT_AVATAR_BYTES + 1)]) {
      const client = fakeClient({ size });
      expect(await loadClientAvatar(client, "h", 7)).toBeNull();
      expect(client.downloadFileData).not.toHaveBeenCalled();
    }
  });

  it("returns null when the downloaded body exceeds the limit", async () => {
    const client = fakeClient({ size: 10n, body: Buffer.alloc(MAX_CLIENT_AVATAR_BYTES + 1) });
    expect(await loadClientAvatar(client, "h", 7)).toBeNull();
  });
});
