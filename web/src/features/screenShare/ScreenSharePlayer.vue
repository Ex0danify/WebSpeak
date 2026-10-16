<template>
  <section v-if="viewing" :ref="setPlayerElement" :class="playerClass" role="region" :aria-label="t('screenShare')">
    <div
      class="relative grid aspect-video min-h-61.25 w-full place-items-center overflow-hidden bg-radial from-media-raised to-media to-68% max-compact:min-h-52.5 [&:fullscreen>div]:aspect-auto [&:fullscreen>div]:h-full [&:fullscreen>div]:max-h-none"
    >
      <video
        v-if="remoteStream"
        :ref="setVideoElement"
        class="block size-full bg-media-deep object-contain"
        autoplay
        playsinline
        :muted="remoteVolume === 0"
      ></video>
      <div v-else class="flex max-w-90 flex-col items-center gap-2.5 p-7.5 text-center">
        <span class="grid size-14.5 place-items-center rounded-lg border border-media-accent/35 bg-media-accent/12 text-media-accent"
          ><Icon name="monitor" :size="28" /></span
        ><strong class="text-md text-media-fg">{{ t("screenShareConnecting") }}</strong
        ><span class="text-2xs leading-normal text-media-fg-muted">{{ error ? errorText : t("directP2POnly") }}</span>
      </div>
      <Tooltip :text="t('screenShareExit')"
        ><Button
          variant="media"
          icon-only
          class="absolute top-3.75 left-3.75 z-3 max-compact:top-2.5 max-compact:left-2.5"
          :aria-label="t('screenShareExit')"
          @click="$emit('leave')"
          ><Icon name="close" :size="22" /></Button
      ></Tooltip>
      <div
        :class="
          cn(
            overlay,
            'absolute top-3.75 right-3.75 z-3 flex min-h-9.5 items-center gap-2 rounded-full py-1.25 pr-2 pl-2.75 text-media-fg max-compact:top-2.5 max-compact:right-2.5',
          )
        "
        :aria-label="t('screenShareViewers')"
      >
        <span class="inline-flex items-center gap-1.25 text-2xs font-bold whitespace-nowrap text-media-fg"
          ><Icon name="users" :size="14" /> {{ viewerCount }}</span
        >
        <span class="inline-flex items-center pl-1"
          ><Avatar
            v-for="viewer in viewers"
            :key="viewer.peerId"
            :name="viewer.nickname"
            :src="viewer.avatar || undefined"
            size="viewer"
            stack
            :style="viewerStyle(viewer)"
            :title="viewer.nickname"
        /></span>
      </div>
      <span
        class="absolute top-5.5 left-16 z-3 inline-flex items-center gap-1.5 text-caption font-extrabold text-media-accent text-shadow-md max-compact:top-4.75 max-compact:left-14.25"
        ><i class="size-1.75 animate-live-dot rounded-full bg-media-live ring-4 ring-media-live/18"></i>{{ t("watchingScreenShare") }}</span
      >
      <span
        class="absolute bottom-4.5 left-4.5 z-3 max-w-9/20 truncate text-xs font-extrabold text-media-fg text-shadow-md max-compact:bottom-3 max-compact:left-3 max-compact:max-w-2/5"
        >{{ ownerName }}</span
      >
      <div
        class="absolute right-3.75 bottom-3.75 z-3 flex items-center gap-2.25 max-compact:right-2.5 max-compact:bottom-2.5 max-compact:gap-1.5"
      >
        <div
          :class="cn(overlay, 'inline-flex min-h-9.5 items-center gap-2 rounded-full px-2.75 text-media-fg max-compact:px-2.25')"
          :title="t('screenShareVolume')"
        >
          <Icon :name="remoteVolume === 0 ? 'volume-off' : 'volume'" :size="18" /><Slider
            class="h-9 w-25.5 max-compact:w-17.5"
            :model-value="Math.round(remoteVolume * 100)"
            :value-text="`${Math.round(remoteVolume * 100)}%`"
            :aria-label="t('screenShareVolume')"
            @update:model-value="remoteVolume = $event / 100"
          />
        </div>
        <Tooltip :text="fullscreen ? t('screenShareExitFullscreen') : t('screenShareFullscreen')"
          ><Button
            variant="media"
            icon-only
            :aria-label="fullscreen ? t('screenShareExitFullscreen') : t('screenShareFullscreen')"
            @click="$emit('toggle-fullscreen')"
            ><Icon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" :size="19" /></Button
        ></Tooltip>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { Slider } from "@/shared/ui/slider";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Avatar } from "@/shared/ui/avatar";
import type { MaybeLocalizedText } from "@/shared/i18n/localizedText";
import type { ScreenShareViewer } from "@/features/screenShare/screenShareTypes";

defineProps<{
  viewing: boolean;
  remoteStream: MediaStream | null;
  error: MaybeLocalizedText;
  errorText: string;
  fullscreen: boolean;
  viewerCount: number;
  viewers: ScreenShareViewer[];
  ownerName: string;
  viewerStyle: (viewer: ScreenShareViewer) => Record<string, string>;
  setVideoElement: (element: unknown) => void;
  setPlayerElement: (element: unknown) => void;
}>();

defineEmits<{
  (e: "leave"): void;
  (e: "toggle-fullscreen"): void;
}>();

const remoteVolume = defineModel<number>("remoteVolume", { default: 1 });

const { t } = useI18n();

// Chrome of the controls floating over the video, on the fixed media tokens.
const overlay = "border border-media-line bg-media-scrim shadow-lg backdrop-blur-sm";
// Fullscreen drops the frame; the stage rules live on the stage as [&:fullscreen>div].
const playerClass = cn(
  "relative mt-4.25 overflow-hidden rounded-lg border border-media-line bg-media shadow-lg backdrop:bg-media-deep max-compact:mt-3.5",
  "[&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-media-deep",
);
</script>
