import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateIdentity } from "../crypto/identity.js";
import { parseCommand } from "../wire/commandText.js";
import { buildClientInit, buildClientInitIv, hashPassword } from "./clientInit.js";
import { VERSION_PROFILES } from "./versionProfiles.js";

const identity = generateIdentity(0).withOffset(42n);
const keys = (text: string) => Object.keys(parseCommand(text).rows[0]);

describe("clientinit", () => {
  it("sends the ts3 profile in the order the SDK used", () => {
    const text = buildClientInit(identity, { nickname: "Web Guest" });
    expect(keys(text)).toEqual([
      "client_nickname",
      "client_version",
      "client_platform",
      "client_input_hardware",
      "client_output_hardware",
      "client_default_channel",
      "client_default_channel_password",
      "client_server_password",
      "client_meta_data",
      "client_version_sign",
      "client_key_offset",
      "client_nickname_phonetic",
      "client_default_token",
      "hwid",
    ]);
    const row = parseCommand(text).rows[0];
    expect(row).toMatchObject({
      client_nickname: "Web Guest",
      client_version: VERSION_PROFILES.ts3.version,
      client_platform: "Linux",
      client_version_sign: VERSION_PROFILES.ts3.sign,
      client_key_offset: "42",
      client_server_password: "",
      hwid: createHash("sha1").update(identity.publicKeyBase64).digest("base64"),
    });
    expect(text).toContain("client_nickname=Web\\sGuest ");
  });

  it("sends the ts6 profile with the native client's empty fields", () => {
    const text = buildClientInit(identity, { nickname: "n", versionProfile: "ts6" });
    expect(keys(text).slice(10)).toEqual([
      "client_key_offset",
      "client_default_token",
      "client_myteamspeak_id",
      "client_integrations",
      "client_active_integrations_info",
      "client_user_tag",
      "hwid",
    ]);
    expect(parseCommand(text).rows[0]).toMatchObject({ client_version: VERSION_PROFILES.ts6.version, client_platform: "Linux" });
  });

  it("sends an explicit version over the named profile", () => {
    const version = {
      version: "6.1.0 [Build: 9999]",
      platform: "Linux",
      sign: "Zm9vYmFyc2lnbmF0dXJlZm9vYmFyc2lnbmF0dXJlZm9vYmFyc2lnbmF0dXJlAA==",
      emptyFields: ["client_default_token"],
    };
    const text = buildClientInit(identity, { nickname: "n", versionProfile: "ts3", version });
    const row = parseCommand(text).rows[0];
    expect(row).toMatchObject({ client_version: version.version, client_platform: "Linux", client_version_sign: version.sign });
    expect(keys(text).slice(10)).toEqual(["client_key_offset", "client_default_token", "hwid"]);
  });

  it("falls back to the ts3 profile without a version", () => {
    const row = parseCommand(buildClientInit(identity, { nickname: "n" })).rows[0];
    expect(row.client_version_sign).toBe(VERSION_PROFILES.ts3.sign);
  });

  it("hashes passwords and keeps the default channel", () => {
    const row = parseCommand(
      buildClientInit(identity, { nickname: "n", serverPassword: "pw", defaultChannel: "/7", defaultChannelPassword: "chan" }),
    ).rows[0];
    expect(row.client_server_password).toBe(createHash("sha1").update("pw").digest("base64"));
    expect(row.client_default_channel_password).toBe(hashPassword("chan"));
    expect(row.client_default_channel).toBe("/7");
    expect(hashPassword("")).toBe("");
  });
});

describe("clientinitiv", () => {
  it("carries alpha, omega, ot=1 and an empty ip, without a=1", () => {
    const text = buildClientInitIv(Buffer.alloc(10, 7), identity);
    const command = parseCommand(text);
    expect(command.name).toBe("clientinitiv");
    expect(command.rows[0]).toEqual({ alpha: Buffer.alloc(10, 7).toString("base64"), omega: identity.publicKeyBase64, ot: "1", ip: "" });
  });

  it("adds a=1 before ip to ask for the alpha handshake", () => {
    const text = buildClientInitIv(Buffer.alloc(10, 7), identity, true);
    expect(keys(text)).toEqual(["alpha", "omega", "ot", "a", "ip"]);
    expect(parseCommand(text).rows[0].a).toBe("1");
  });
});
