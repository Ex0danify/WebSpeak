import type { MessageKey } from "@/shared/i18n/messageKeys";
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { readStorage, writeStorage } from "@/shared/services/safeStorage.js";
import type { ChannelMember } from "@/features/session";
import type { ScreenShareOutputSettings, ScreenShareStream } from "@/features/screenShare/screenShareTypes";

export type ScreenShareResolutionPreset = "source" | "720p" | "1080p";

/** The slice of the room's `screenShare` group this composable reads. Declared here, not imported
 *  from features/room (a higher layer); useRoomSession()'s group satisfies it structurally. */
export interface ScreenShareSessionSlice {
  screenShareStreams: ScreenShareStream[];
  screenShareViewing: Ref<boolean>;
  screenShareViewingStreamId: Ref<string>;
  screenShareRemoteStream: Ref<MediaStream | null>;
  screenShareRemoteVolume: Ref<number>;
  screenShareError: Ref<MaybeLocalizedText>;
  screenShareErrorCode: Ref<string>;
  startScreenShare: (audio: boolean, settings?: ScreenShareOutputSettings) => Promise<void>;
  joinScreenShare: (streamId: string) => void;
  leaveScreenShare: () => void;
}

export interface UseScreenShareOptions {
  screenShare: ScreenShareSessionSlice;
  /** Passed in by RoomView (the pure helper in shared/lib/format). */
  avatarStyle: (name: string, isSelf?: boolean, avatar?: string) => Record<string, string>;
  /** Owned by useJoinForm: whose viewer avatar (if any) is "self" in the player's viewer list. */
  nickname: Ref<string>;
  /** The member directory, viewers carry only a client id and their avatar is looked up here. */
  members?: ReadonlyArray<ChannelMember>;
}

/** The screen-share player (video element, fullscreen, remote volume), the start-screen-share
 *  settings dialog, and the per-member share/watch derivations built on top of the streams
 *  useRoomSession() already tracks. */
export function useScreenShare(options: UseScreenShareOptions) {
  const { avatarStyle, nickname, members = [] } = options;
  const {
    screenShareStreams,
    screenShareViewing,
    screenShareViewingStreamId,
    screenShareRemoteStream,
    screenShareRemoteVolume,
    screenShareError,
    screenShareErrorCode,
    startScreenShare,
    joinScreenShare,
    leaveScreenShare,
  } = options.screenShare;
  const { t } = useI18n();

  const screenVideoEl = ref<HTMLVideoElement | null>(null);
  const screenSharePlayerEl = ref<HTMLElement | null>(null);
  const screenShareFullscreen = ref(false);

  const screenShareResolutionOptions: Array<{ value: ScreenShareResolutionPreset; width?: number; height?: number; label: MessageKey }> = [
    { value: "source", label: "screenShareResolutionSource" },
    { value: "720p", width: 1280, height: 720, label: "screenShareResolution720p" },
    { value: "1080p", width: 1920, height: 1080, label: "screenShareResolution1080p" },
  ];
  const screenShareFrameRateOptions = [5, 10, 15, 24, 30, 60];
  const storedScreenShareResolution = readStorage("webspeak:screen-share-resolution") as ScreenShareResolutionPreset | null;
  const screenShareResolutionPreset = ref<ScreenShareResolutionPreset>(
    screenShareResolutionOptions.some((option) => option.value === storedScreenShareResolution) ? storedScreenShareResolution! : "1080p",
  );
  const storedScreenShareFrameRate = Number(readStorage("webspeak:screen-share-framerate"));
  const screenShareFrameRate = ref(screenShareFrameRateOptions.includes(storedScreenShareFrameRate) ? storedScreenShareFrameRate : 15);
  const screenShareSettingsOpen = ref(false);

  function setScreenVideoElement(element: unknown): void {
    screenVideoEl.value = element instanceof HTMLVideoElement ? element : null;
  }

  function setScreenSharePlayerElement(element: unknown): void {
    screenSharePlayerEl.value = element instanceof HTMLElement ? element : null;
  }

  const screenShareIndicatorBars = [5, 10, 7, 12, 8, 10];

  const screenShareErrorText = computed(() => {
    if (screenShareErrorCode.value === "SCREEN_SHARE_NATIVE_BRIDGE_REQUIRED") return t("screenShareNativeUnavailable");
    return resolveText(screenShareError.value);
  });
  function ownerName(stream: ScreenShareStream | null): string {
    if (!stream) return t("screenShare");
    if (stream.nameKind === "teamspeakNative") return t("screenShareTeamSpeakUser", { id: stream.ownerClientId ?? "" });
    return stream.ownerNickname || t("screenShare");
  }
  const activeScreenShareStream = computed<ScreenShareStream | null>(
    () => screenShareStreams.find((stream) => stream.streamId === screenShareViewingStreamId.value) ?? null,
  );
  // The player shows at most five, so only those are resolved. A viewer missing from the directory keeps the initial fallback.
  const screenSharePlayerViewers = computed(() =>
    (activeScreenShareStream.value?.viewers.slice(-5) ?? []).map((viewer) => {
      if (viewer.clientId === undefined) return viewer;
      const avatar = members.find((member) => member.id === viewer.clientId)?.avatar;
      return avatar ? { ...viewer, avatar } : viewer;
    }),
  );
  const screenSharePlayerViewerCount = computed(
    () => activeScreenShareStream.value?.viewerCount ?? activeScreenShareStream.value?.viewers.length ?? 0,
  );
  const screenSharePlayerOwnerName = computed(() => ownerName(activeScreenShareStream.value));

  function screenShareStreamForMember(member: ChannelMember): ScreenShareStream | null {
    return (
      screenShareStreams.find((stream) => {
        if (typeof stream.ownerClientId === "number" && stream.ownerClientId === member.id) return true;
        if (stream.source === "teamspeak" && stream.ownerPeerId === `ts-${member.id}`) return true;
        return stream.ownerNickname === member.nickname;
      }) ?? null
    );
  }

  function toggleScreenShareForMember(member: ChannelMember): void {
    const stream = screenShareStreamForMember(member);
    if (!stream) return;
    if (screenShareViewingStreamId.value === stream.streamId) leaveScreenShare();
    else joinScreenShare(stream.streamId);
  }

  function screenShareViewerStyle(viewer: { nickname: string; avatar?: string }) {
    return avatarStyle(viewer.nickname, viewer.nickname === nickname.value, viewer.avatar ?? "");
  }

  function syncScreenShareFullscreen(): void {
    screenShareFullscreen.value = document.fullscreenElement === screenSharePlayerEl.value;
  }

  async function toggleScreenShareFullscreen(): Promise<void> {
    const player = screenSharePlayerEl.value;
    if (!player) return;
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else if (player.requestFullscreen) await player.requestFullscreen();
    } catch {
      screenShareFullscreen.value = false;
    }
  }

  async function startScreenShareWithSettings(): Promise<void> {
    const preset = screenShareResolutionOptions.find((option) => option.value === screenShareResolutionPreset.value);
    const settings: ScreenShareOutputSettings = {
      ...(preset?.width && preset.height ? { maxWidth: preset.width, maxHeight: preset.height } : {}),
      maxFrameRate: screenShareFrameRate.value,
    };
    writeStorage("webspeak:screen-share-resolution", screenShareResolutionPreset.value);
    writeStorage("webspeak:screen-share-framerate", String(screenShareFrameRate.value));
    screenShareSettingsOpen.value = false;
    await startScreenShare(true, settings);
  }

  watch([screenShareRemoteStream, screenShareRemoteVolume], ([stream, volume]) => {
    void nextTick(() => {
      const video = screenVideoEl.value;
      if (!video) return;
      if (video.srcObject !== stream) video.srcObject = stream;
      video.volume = Math.max(0, Math.min(1, volume ?? 1));
      if (stream) void video.play().catch(() => undefined);
    });
  });
  watch(screenShareViewing, (viewing) => {
    if (!viewing && document.fullscreenElement === screenSharePlayerEl.value) void document.exitFullscreen().catch(() => undefined);
  });

  let fullscreenChangeHandler: (() => void) | undefined;
  onMounted(() => {
    fullscreenChangeHandler = syncScreenShareFullscreen;
    document.addEventListener("fullscreenchange", fullscreenChangeHandler);
  });
  onUnmounted(() => {
    if (fullscreenChangeHandler) document.removeEventListener("fullscreenchange", fullscreenChangeHandler);
  });

  return {
    screenVideoEl,
    setScreenVideoElement,
    screenSharePlayerEl,
    setScreenSharePlayerElement,
    screenShareFullscreen,
    syncScreenShareFullscreen,
    toggleScreenShareFullscreen,
    screenShareResolutionOptions,
    screenShareResolutionPreset,
    screenShareFrameRateOptions,
    screenShareFrameRate,
    screenShareSettingsOpen,
    startScreenShareWithSettings,
    screenShareIndicatorBars,
    screenShareErrorText,
    activeScreenShareStream,
    screenSharePlayerViewers,
    screenSharePlayerViewerCount,
    screenSharePlayerOwnerName,
    screenShareStreamForMember,
    toggleScreenShareForMember,
    screenShareViewerStyle,
  };
}
