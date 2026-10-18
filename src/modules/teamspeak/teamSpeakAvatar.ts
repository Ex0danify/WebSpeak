import { Writable } from "node:stream";
import type { Client as TS3FullClient } from "@echosixhiya/teamspeak-client";
import { MAX_CLIENT_AVATAR_BYTES, type TSClientAvatar } from "./teamSpeakBackend.js";

export type TeamSpeakAvatarClient = Pick<TS3FullClient, "execCommandWithResponse" | "fileTransferInitDownload" | "downloadFileData">;

/**
 * Avatars are not in directory notifications. clientinfo gives the marker and filename, the file comes over
 * the file-transfer port. Any failure (permission, missing, blocked port, too big) returns null so the web client keeps its initial.
 */
export async function loadClientAvatar(
  client: TeamSpeakAvatarClient,
  host: string,
  clientId: number,
  expectedUid = "",
): Promise<TSClientAvatar | null> {
  if (!Number.isInteger(clientId) || clientId <= 0 || clientId > 65535) throw new Error("Invalid TeamSpeak client id");
  const rows = await client.execCommandWithResponse(`clientinfo clid=${clientId}`, 5_000);
  const info = rows.find((row) => {
    if (expectedUid && row.client_unique_identifier !== expectedUid) return false;
    return typeof row.client_flag_avatar === "string" && typeof row.client_base64HashClientUID === "string";
  });
  if (!info) return null;
  const cacheKey = info.client_flag_avatar?.trim() ?? "";
  const avatarFileKey = info.client_base64HashClientUID?.trim() ?? "";
  if (!cacheKey || !/^[A-Za-z0-9+/=_-]{8,256}$/.test(avatarFileKey)) return null;

  const transfer = await client.fileTransferInitDownload(0n, `/avatar_${avatarFileKey}`, "");
  const size = Number(transfer.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_CLIENT_AVATAR_BYTES) return null;

  const chunks: Buffer[] = [];
  const destination = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  await client.downloadFileData(host, transfer, destination);
  const data = Buffer.concat(chunks);
  if (data.length === 0 || data.length > MAX_CLIENT_AVATAR_BYTES) return null;
  return { cacheKey, data };
}

class StaleConnectionError extends Error {}

/**
 * loadClientAvatar for one connection. A reconnect replaces the SDK client, so once isCurrent says no, whatever
 * the old connection still returns belongs to another session and the lookup ends with null.
 */
export async function loadClientAvatarOnConnection(
  client: TeamSpeakAvatarClient,
  isCurrent: () => boolean,
  pace: <T>(command: () => Promise<T>) => Promise<T>,
  host: string,
  clientId: number,
  expectedUid = "",
): Promise<TSClientAvatar | null> {
  const current = <T>(value: T): T => {
    if (!isCurrent()) throw new StaleConnectionError();
    return value;
  };
  const guarded: TeamSpeakAvatarClient = {
    execCommandWithResponse: async (command, timeoutMs) => current(await pace(() => client.execCommandWithResponse(command, timeoutMs))),
    fileTransferInitDownload: async (...args) => current(await client.fileTransferInitDownload(...args)),
    downloadFileData: async (...args) => current(await client.downloadFileData(...args)),
  };
  try {
    return current(await loadClientAvatar(guarded, host, clientId, expectedUid));
  } catch (error: unknown) {
    if (error instanceof StaleConnectionError) return null;
    throw error;
  }
}
