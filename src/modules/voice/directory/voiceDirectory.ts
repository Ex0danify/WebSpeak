import type { TSDirectorySnapshot } from "../../teamspeak/index.js";
import type { MessageParams } from "../../../shared/messageCodes.js";
import type { ServerEvent, VoiceConnection, WebClientEntry } from "../voiceTypes.js";
import { avatarDataUrl, isChannelRecord, mapChannelTree, normalizeDirectorySnapshot } from "./voiceDirectoryView.js";

export interface VoiceDirectoryDeps {
  sendInitialState(ctx: VoiceConnection): void;
  reconcileScreenShareAfterClientMove(entry: WebClientEntry, clientId: number, targetChannelId: bigint): void;
  reconcileNativeScreenShareAfterClientLeave(entry: WebClientEntry, clientId: number): void;
}

/**
 * Registers the directory listeners, call it before connect(). Welcome-flow events are queued by
 * DirectorySynchronizer until its snapshot sets the baseline.
 */
export function registerVoiceDirectory(ctx: VoiceConnection, deps: VoiceDirectoryDeps): void {
  ctx.tsClient.on("directorySnapshot", (snapshot: TSDirectorySnapshot) => {
    const previousChannels = ctx.entry.channelTree;
    ctx.directory.applySnapshot(snapshot);
    refreshDirectory(ctx);
    trackChannelEvents(ctx, previousChannels, ctx.entry.channelTree);
    deps.sendInitialState(ctx);
    if (ctx.state.tsReady && ctx.state.initialStateSent) ctx.sendJson({ type: "channelList", channels: ctx.entry.channelTree });
    scheduleMemberAvatarRefresh(ctx);
  });

  ctx.tsClient.on("clientEnter", (info) => {
    const candidateSelfId = ctx.tsClient.getClientId();
    if (candidateSelfId > 0 && info.id === candidateSelfId) {
      ctx.state.selfId = candidateSelfId;
      if (info.channelID !== undefined && info.channelID !== 0n) ctx.state.selfChannelId = info.channelID;
    }
    const wasKnown = ctx.entry.members.has(info.id);
    ctx.directory.applyClientEnter(info);
    refreshDirectory(ctx);
    if (ctx.state.tsReady && ctx.state.initialStateSent) {
      ctx.sendJson({ type: "channelList", channels: ctx.entry.channelTree });
      if (!wasKnown)
        ctx.sendJson({ type: "memberEnter", id: info.id, nickname: info.nickname, uid: info.uid, isSelf: info.id === ctx.state.selfId });
      if (!wasKnown && info.id !== ctx.state.selfId)
        addServerEvent(ctx, "joined", `${info.nickname || "Unknown user"} joined the server`, { nickname: info.nickname });
      scheduleMemberAvatarRefresh(ctx);
    }
  });

  ctx.tsClient.on("clientLeave", (info) => {
    deps.reconcileNativeScreenShareAfterClientLeave(ctx.entry, info.id);
    const wasKnown = ctx.entry.members.has(info.id);
    const leavingMember = ctx.entry.members.get(info.id);
    ctx.entry.webrtc?.setMemberVolume(info.id, 1);
    ctx.directory.applyClientLeave(info.id);
    refreshDirectory(ctx);
    if (ctx.state.tsReady && ctx.state.initialStateSent && wasKnown) {
      ctx.sendJson({ type: "memberLeave", id: info.id });
      ctx.sendJson({ type: "channelList", channels: ctx.entry.channelTree });
      if (info.id !== ctx.state.selfId)
        addServerEvent(ctx, "left", `${leavingMember?.nickname || "A user"} left the server`, { nickname: leavingMember?.nickname });
    }
  });

  ctx.tsClient.on("clientMoved", (info) => {
    if (info.targetChannelID === undefined || info.targetChannelID === 0n) return;
    deps.reconcileScreenShareAfterClientMove(ctx.entry, info.id, info.targetChannelID);
    const movedMember = ctx.entry.members.get(info.id);
    if (info.id === ctx.state.selfId) ctx.state.selfChannelId = info.targetChannelID;
    ctx.directory.applyClientMoved(info.id, info.targetChannelID);
    refreshDirectory(ctx);
    if (ctx.state.tsReady && ctx.state.initialStateSent) {
      ctx.sendJson({ type: "channelList", channels: ctx.entry.channelTree });
      if (info.id !== ctx.state.selfId)
        addServerEvent(ctx, "moved", `${movedMember?.nickname || "A user"} moved to another channel`, { nickname: movedMember?.nickname });
    }
  });

  ctx.tsClient.on("clientUpdated", (info) => {
    ctx.directory.applyClientUpdated(info);
    refreshDirectory(ctx);
    if (ctx.state.tsReady && ctx.state.initialStateSent) ctx.sendJson({ type: "channelList", channels: ctx.entry.channelTree });
  });
}

function trackChannelEvents(ctx: VoiceConnection, previous: unknown[], next: unknown[]) {
  if (!ctx.state.initialStateSent) return;
  const before = new Map(previous.filter(isChannelRecord).map((channel) => [channel.id, channel]));
  const after = new Map(next.filter(isChannelRecord).map((channel) => [channel.id, channel]));
  for (const channel of after.values()) {
    if (!before.has(channel.id))
      addServerEvent(ctx, "channelCreated", `Channel "${channel.name}" was created`, { channelName: channel.name });
    else if (before.get(channel.id)?.name !== channel.name)
      addServerEvent(ctx, "channelRenamed", `Channel was renamed to "${channel.name}"`, { channelName: channel.name });
  }
  for (const channel of before.values())
    if (!after.has(channel.id))
      addServerEvent(ctx, "channelDeleted", `Channel "${channel.name}" was deleted`, { channelName: channel.name });
}

function eventParams(extra: Partial<Pick<ServerEvent, "nickname" | "channelName">>): { params?: MessageParams } {
  const params: MessageParams = {};
  if (extra.nickname) params.nickname = extra.nickname;
  if (extra.channelName !== undefined) params.channelName = extra.channelName;
  return Object.keys(params).length ? { params } : {};
}

export function addServerEvent(
  ctx: VoiceConnection,
  kind: ServerEvent["kind"],
  message: string,
  extra: Partial<Pick<ServerEvent, "nickname" | "channelName">> = {},
) {
  const event: ServerEvent = {
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    message,
    ...extra,
    ...eventParams(extra),
    timestamp: Date.now(),
  };
  ctx.entry.eventLog.push(event);
  if (ctx.entry.eventLog.length > 200) ctx.entry.eventLog.splice(0, ctx.entry.eventLog.length - 200);
  if (ctx.state.initialStateSent) ctx.sendJson({ type: "serverEvent", event });
}

export function refreshDirectory(ctx: VoiceConnection) {
  const snapshot = ctx.directory.getSnapshot();
  if (!snapshot) return;
  const previousWhisperTargets = [...ctx.entry.whisperTargetIds].sort((a, b) => a - b);
  const effectiveSelfId = ctx.state.selfId || ctx.tsClient.getClientId();
  const sdkChannelId = ctx.tsClient.getChannelId();
  if (ctx.state.selfChannelId === 0n && sdkChannelId !== 0n) ctx.state.selfChannelId = sdkChannelId;
  const normalizedSnapshot = normalizeDirectorySnapshot(
    snapshot,
    effectiveSelfId,
    ctx.state.selfChannelId,
    ctx.entry.nickname,
    ctx.channelName,
  );
  ctx.entry.channelTree = mapChannelTree(normalizedSnapshot, ctx.entry.avatarCache);
  ctx.entry.members.clear();
  for (const client of normalizedSnapshot.clients) {
    const avatar = client.uid ? ctx.entry.avatarCache.get(client.uid) : undefined;
    ctx.entry.members.set(client.id, {
      id: client.id,
      nickname: client.nickname,
      uid: client.uid,
      ...(avatar ? { avatar } : {}),
      away: client.away,
      awayMessage: client.awayMessage,
      inputMuted: client.inputMuted,
      outputMuted: client.outputMuted,
      channelCommander: client.channelCommander,
    });
  }
  for (const clientId of ctx.entry.whisperTargetIds) {
    if (!ctx.entry.members.has(clientId) || clientId === effectiveSelfId) ctx.entry.whisperTargetIds.delete(clientId);
  }
  if (!ctx.entry.whisperTargetIds.size) ctx.entry.whisperActive = false;
  const nextWhisperTargets = [...ctx.entry.whisperTargetIds].sort((a, b) => a - b);
  if (
    ctx.state.initialStateSent &&
    (previousWhisperTargets.length !== nextWhisperTargets.length ||
      previousWhisperTargets.some((clientId, index) => clientId !== nextWhisperTargets[index]))
  ) {
    ctx.sendJson({ type: "whisperTargets", targetIds: nextWhisperTargets, active: ctx.entry.whisperActive });
  }
}

export function scheduleMemberAvatarRefresh(ctx: VoiceConnection, delayMs = 0): void {
  if (!ctx.entry.isAlive || ctx.state.avatarRefreshTimer) return;
  ctx.state.avatarRefreshTimer = setTimeout(() => {
    ctx.state.avatarRefreshTimer = null;
    void refreshMemberAvatars(ctx);
  }, delayMs);
  ctx.state.avatarRefreshTimer.unref?.();
}

async function refreshMemberAvatars(ctx: VoiceConnection): Promise<void> {
  if (!ctx.entry.isAlive || !ctx.state.tsReady || ctx.session.state !== "connected" || ctx.state.avatarRefreshRunning) return;
  ctx.state.avatarRefreshRunning = true;
  try {
    const candidates = [...ctx.entry.members.values()]
      .filter((member) => member.uid && !ctx.entry.avatarCache.has(member.uid) && !ctx.avatarRequests.has(member.uid))
      .slice(0, 50);
    for (const member of candidates) {
      if (!ctx.entry.isAlive || !member.uid) return;
      ctx.avatarRequests.add(member.uid);
      try {
        const loaded = await ctx.tsClient.getClientAvatar(member.id, member.uid);
        const avatar = loaded ? avatarDataUrl(loaded.data) : null;
        ctx.entry.avatarCache.set(member.uid, avatar);
        const current = ctx.entry.members.get(member.id);
        if (current && current.uid === member.uid && avatar) {
          current.avatar = avatar;
          ctx.sendJson({ type: "memberAvatar", id: member.id, uid: member.uid, avatar });
        }
      } catch (error: unknown) {
        // Avatars are optional, a permission or file-transfer failure must never affect joining, updates or voice.
        ctx.entry.avatarCache.set(member.uid, null);
        ctx.logger.debug(
          {
            entryId: ctx.entry.id,
            clientId: member.id,
            uid: member.uid,
            err: error instanceof Error ? error.message : String(error),
          },
          "TeamSpeak client avatar unavailable",
        );
      } finally {
        ctx.avatarRequests.delete(member.uid);
      }
    }
  } finally {
    ctx.state.avatarRefreshRunning = false;
    if (
      ctx.entry.isAlive &&
      ctx.state.tsReady &&
      ctx.session.state === "connected" &&
      [...ctx.entry.members.values()].some((member) => member.uid && !ctx.entry.avatarCache.has(member.uid))
    ) {
      scheduleMemberAvatarRefresh(ctx, 250);
    }
  }
}
