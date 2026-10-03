import type { ScreenShareStream, ScreenShareViewer } from "./screenShareTypes";

/** Validates and clamps what the gateway sends for a stream or its viewer list. Pure. */
export function normalizeScreenShareViewers(raw: unknown): ScreenShareViewer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((viewer): viewer is ScreenShareViewer => Boolean(viewer) && typeof viewer === "object" && typeof (viewer as ScreenShareViewer).peerId === "string" && typeof (viewer as ScreenShareViewer).nickname === "string")
    .slice(0, 64)
    .map((viewer) => ({
      peerId: viewer.peerId.slice(0, 128),
      nickname: viewer.nickname.slice(0, 120),
      ...(typeof viewer.avatar === "string" && viewer.avatar.length <= 128 * 1024 ? { avatar: viewer.avatar } : {}),
    }));
}

export function parseScreenShareStream(raw: unknown): ScreenShareStream | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ScreenShareStream>;
  if (typeof value.streamId !== "string" || typeof value.ownerPeerId !== "string") return null;
  const stream: ScreenShareStream = {
    streamId: value.streamId,
    source: value.source === "teamspeak" ? "teamspeak" : "browser",
    ownerPeerId: value.ownerPeerId,
    ...(typeof value.ownerClientId === "number" ? { ownerClientId: value.ownerClientId } : {}),
    ownerNickname: typeof value.ownerNickname === "string" ? value.ownerNickname : "TeamSpeak 用户",
    name: typeof value.name === "string" ? value.name : "屏幕共享",
    audio: value.audio === true,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    viewerCount: typeof value.viewerCount === "number" ? value.viewerCount : 0,
    viewers: normalizeScreenShareViewers(value.viewers),
  };
  return stream;
}
