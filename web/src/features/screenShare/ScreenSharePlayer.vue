<template>
  <section v-if="viewing" :ref="setPlayerElement" class="screen-share-player" role="region" :aria-label="t('screenShare')">
    <div class="screen-share-player-stage">
      <video v-if="remoteStream" :ref="setVideoElement" class="screen-share-player-video" autoplay playsinline :muted="remoteVolume === 0"></video>
      <div v-else class="screen-share-player-placeholder"><span class="screen-share-player-placeholder-icon"><Icon name="monitor" :size="28" /></span><strong>{{ t('screenShareConnecting') }}</strong><span>{{ error ? errorText : t('directP2POnly') }}</span></div>
      <button type="button" class="screen-share-player-exit" :aria-label="t('screenShareExit')" :title="t('screenShareExit')" @click="$emit('leave')"><Icon name="close" :size="22" /></button>
      <div class="screen-share-player-viewers" :aria-label="t('screenShareViewers')">
        <span class="screen-share-player-viewer-label"><Icon name="users" :size="14" /> {{ viewerCount }}</span>
        <span class="screen-share-player-viewer-avatars"><span v-for="viewer in viewers" :key="viewer.peerId" class="screen-share-player-viewer-avatar" :style="viewerStyle(viewer)" :title="viewer.nickname">{{ viewer.avatar ? '' : avatarInitial(viewer.nickname) }}</span></span>
      </div>
      <span class="screen-share-player-live"><i></i>{{ t('watchingScreenShare') }}</span>
      <span class="screen-share-player-source">{{ ownerName }}</span>
      <div class="screen-share-player-controls">
        <div class="screen-share-player-volume" :title="t('screenShareVolume')"><Icon :name="remoteVolume === 0 ? 'volume-off' : 'volume'" :size="18" /><Slider class="h-9 w-[102px] max-[740px]:h-9 max-[740px]:w-[70px]" :model-value="Math.round(remoteVolume * 100)" :value-text="`${Math.round(remoteVolume * 100)}%`" :aria-label="t('screenShareVolume')" @update:model-value="remoteVolume = $event / 100" /></div>
        <button type="button" :aria-label="fullscreen ? t('screenShareExitFullscreen') : t('screenShareFullscreen')" :title="fullscreen ? t('screenShareExitFullscreen') : t('screenShareFullscreen')" @click="$emit('toggle-fullscreen')"><Icon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" :size="19" /></button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { Slider } from "@/shared/ui/slider";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { avatarInitial } from "@/shared/lib/format.js";
import type { MaybeLocalizedText } from "@/shared/i18n/localizedText";
import type { ScreenShareViewer } from "./screenShareTypes";

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
</script>

<style scoped>
/* style-budget: allow screen-share-player */
.screen-share-player { position: relative; margin-top: 17px; overflow: hidden; border: 1px solid #263b37; border-radius: 18px; background: #070d0d; box-shadow: 0 12px 30px color-mix(in srgb, var(--ws-fg) 18%, transparent); }
.screen-share-player-stage { position: relative; display: grid; width: 100%; min-height: 245px; aspect-ratio: 16 / 9; place-items: center; overflow: hidden; background: radial-gradient(circle at 50% 40%, #1d3934, #091010 68%); }
.screen-share-player-video { display: block; width: 100%; height: 100%; object-fit: contain; background: #030606; }
.screen-share-player-placeholder { display: flex; align-items: center; flex-direction: column; gap: 10px; max-width: 360px; padding: 30px; color: #b1c2bd; text-align: center; }
.screen-share-player-placeholder-icon { display: grid; place-items: center; width: 58px; height: 58px; color: #69d2c7; border: 1px solid rgba(105,210,199,.36); border-radius: 18px; background: rgba(105,210,199,.12); }
.screen-share-player-placeholder strong { color: #f0f8f5; font-size: 15px; }
.screen-share-player-placeholder > span:last-child { color: #8ea39d; font-size: 10px; line-height: 1.5; }
.screen-share-player-exit, .screen-share-player-controls button { display: grid; place-items: center; width: 38px; height: 38px; padding: 0; color: #edf7f4; border: 1px solid rgba(255,255,255,.14); border-radius: 50%; background: rgba(8,14,14,.7); box-shadow: 0 5px 16px rgba(0,0,0,.22); backdrop-filter: blur(8px); cursor: pointer; }
.screen-share-player-exit { position: absolute; top: 15px; left: 15px; z-index: 3; }
.screen-share-player-exit:hover, .screen-share-player-controls button:hover { color: #fff; border-color: rgba(105,210,199,.75); background: rgba(0,106,100,.85); }
.screen-share-player-viewers { position: absolute; top: 15px; right: 15px; z-index: 3; display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 8px 5px 11px; color: #f3faf8; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; background: rgba(8,14,14,.74); box-shadow: 0 5px 16px rgba(0,0,0,.22); backdrop-filter: blur(8px); }
.screen-share-player-viewer-label { display: inline-flex; align-items: center; gap: 5px; color: #d2e2de; font-size: 10px; font-weight: 700; white-space: nowrap; }
.screen-share-player-viewer-avatars { display: inline-flex; align-items: center; padding-left: 4px; }
.screen-share-player-viewer-avatar { display: grid; place-items: center; width: 25px; height: 25px; margin-left: -4px; color: #fff; border: 2px solid #15211f; border-radius: 50%; font-size: 9px; font-weight: 800; box-shadow: 0 2px 7px rgba(0,0,0,.25); }
.screen-share-player-live { position: absolute; top: 22px; left: 64px; z-index: 3; display: inline-flex; align-items: center; gap: 6px; color: #a7fff0; font-size: 11px; font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,.55); }
.screen-share-player-live i { width: 7px; height: 7px; border-radius: 50%; background: #65e48b; box-shadow: 0 0 0 4px rgba(101,228,139,.18); animation: screen-share-live-dot 1.2s ease-in-out infinite; }
.screen-share-player-source { position: absolute; bottom: 18px; left: 18px; z-index: 3; max-width: 45%; overflow: hidden; color: #f5fbf8; font-size: 12px; font-weight: 800; text-overflow: ellipsis; text-shadow: 0 2px 8px rgba(0,0,0,.7); white-space: nowrap; }
.screen-share-player-controls { position: absolute; right: 15px; bottom: 15px; z-index: 3; display: flex; align-items: center; gap: 9px; }
.screen-share-player-volume { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 11px; color: #edf7f4; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; background: rgba(8,14,14,.7); box-shadow: 0 5px 16px rgba(0,0,0,.22); backdrop-filter: blur(8px); }
.screen-share-player:fullscreen { width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #030606; }
.screen-share-player:fullscreen .screen-share-player-stage { height: 100%; max-height: none; aspect-ratio: auto; }
.screen-share-player::backdrop { background: #030606; }
@media (max-width: 740px) {
  .screen-share-player { margin-top: 14px; border-radius: 14px; }
  .screen-share-player-stage { min-height: 210px; }
  .screen-share-player-viewers { top: 10px; right: 10px; }
  .screen-share-player-live { top: 19px; left: 57px; }
  .screen-share-player-source { bottom: 12px; left: 12px; max-width: 40%; }
  .screen-share-player-controls { right: 10px; bottom: 10px; gap: 6px; }
  .screen-share-player-volume { padding-inline: 9px; }
  .screen-share-player-exit { top: 10px; left: 10px; }
}
/* style-budget: end */
</style>
