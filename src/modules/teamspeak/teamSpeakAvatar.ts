import { Writable } from "node:stream";
import type { Client as TS3FullClient } from "@echosixhiya/teamspeak-client";

export interface TSClientAvatar {
  /** TeamSpeak's avatar content marker, used to invalidate a cached avatar. */
  cacheKey: string;
  data: Buffer;
}

/** The slice of the SDK client the avatar download needs. */
export type TeamSpeakAvatarClient = Pick<TS3FullClient, "execCommandWithResponse" | "fileTransferInitDownload" | "downloadFileData">;

// Keep enough room for avatars produced by the native client. The previous
// 120 KiB limit rejected the 134 KiB PNG used by the Shanghai test account,
// so every avatar silently fell back to its initial letter.
export const MAX_CLIENT_AVATAR_BYTES = 256 * 1024;

/**
 * Load a visible client's TeamSpeak avatar through the client protocol.
 *
 * TeamSpeak does not include the avatar bytes in directory notifications.
 * `clientinfo` exposes the avatar marker and the per-identity filename; the
 * file itself is then read through the normal TeamSpeak file-transfer port.
 * A missing permission, missing avatar, blocked file-transfer port, or an
 * oversized image is intentionally reported as `null` so the web client can
 * keep its generated initial avatar.
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
