import { createHash } from "node:crypto";
import type { Identity } from "../crypto/identity.js";
import { buildCommand, type CommandValue } from "../wire/commandText.js";
import { VERSION_PROFILES, type VersionProfile, type VersionProfileName } from "./versionProfiles.js";

export interface ClientInitOptions {
  nickname: string;
  serverPassword?: string;
  /** Channel path or `/<id>`. */
  defaultChannel?: string;
  defaultChannelPassword?: string;
  /** Default `ts3`, what the gateway sent so far. */
  versionProfile?: VersionProfileName;
  /** An explicit version to send instead of a named profile. Wins over `versionProfile` when set. */
  version?: VersionProfile;
}

/** Passwords go out as `base64(sha1(password))`, an empty one stays empty. */
export function hashPassword(password: string): string {
  return password === "" ? "" : createHash("sha1").update(password).digest("base64");
}

/** `ts6` adds `a=1`, which asks a TS6 server for the TS6 handshake. A TS3 server ignores it. */
export function buildClientInitIv(alpha: Uint8Array, identity: Identity, ts6 = false): string {
  return buildCommand("clientinitiv", [
    ["alpha", Buffer.from(alpha).toString("base64")],
    ["omega", identity.publicKeyBase64],
    ["ot", 1],
    ...(ts6 ? ([["a", 1]] as [string, CommandValue][]) : []),
    ["ip", ""],
  ]);
}

export function buildClientInit(identity: Identity, options: ClientInitOptions): string {
  const profile = options.version ?? VERSION_PROFILES[options.versionProfile ?? "ts3"];
  const fields: [string, CommandValue][] = [
    ["client_nickname", options.nickname],
    ["client_version", profile.version],
    ["client_platform", profile.platform],
    ["client_input_hardware", 1],
    ["client_output_hardware", 1],
    ["client_default_channel", options.defaultChannel ?? ""],
    ["client_default_channel_password", hashPassword(options.defaultChannelPassword ?? "")],
    ["client_server_password", hashPassword(options.serverPassword ?? "")],
    ["client_meta_data", ""],
    ["client_version_sign", profile.sign],
    ["client_key_offset", identity.offset],
    ...profile.emptyFields.map((field): [string, CommandValue] => [field, ""]),
    // The native client sends its own hardware id, ours stays stable per identity.
    ["hwid", createHash("sha1").update(identity.publicKeyBase64).digest("base64")],
  ];
  return buildCommand("clientinit", fields);
}
