<template>
  <div class="network-performance">
    <Button variant="outline" size="sm" class="gap-1.5 border-line bg-accent-soft px-[9px] text-accent hover:border-accent/35 hover:bg-accent-soft aria-expanded:border-accent/35 max-[740px]:size-9 max-[740px]:px-0 max-[391px]:size-8" :title="t('networkPerformance')" :aria-label="t('networkPerformance')" :aria-expanded="performancePanelOpen" @click.stop="$emit('toggle-panel')"><Icon name="activity" :size="16" /><span class="font-normal max-[740px]:hidden">{{ t('networkPerformance') }}</span><span v-if="performanceStats.ready && performanceStats.gatewayLatencyMs != null" class="font-mono text-[10px] font-normal text-fg-muted max-[740px]:hidden">{{ performanceStats.gatewayLatencyMs }} ms</span><span class="inline-flex max-[740px]:hidden"><Icon name="chevron-down" :size="13" /></span></Button>
    <section v-if="performancePanelOpen" class="performance-panel" role="dialog" :aria-label="t('networkPerformance')" @click.stop>
      <header><div><strong>{{ t('networkPerformance') }}</strong><small>{{ t('networkPerformanceHint') }}</small></div><button type="button" class="performance-refresh" :title="t('measureNow')" :disabled="performanceRunning" @click="$emit('refresh')"><Icon name="refresh" :size="15" /></button></header>
      <div class="performance-route"><span>{{ t('browser') }}</span><i></i><span>{{ t('webSpeakGateway') }}</span><i></i><span>{{ t('teamSpeakServer') }}</span></div>
      <div class="performance-metrics"><article><small>{{ t('browserToGateway') }}</small><strong>{{ performanceStats.gatewayLatencyMs == null ? '—' : `${performanceStats.gatewayLatencyMs} ms` }}</strong><span>{{ t('packetLoss') }} {{ performanceStats.gatewayLossPercent == null ? '—' : `${performanceStats.gatewayLossPercent}%` }}</span></article><article><small>{{ t('gatewayToTeamSpeak') }}</small><strong>{{ performanceStats.teamSpeakLatencyMs == null ? '—' : `${performanceStats.teamSpeakLatencyMs} ms` }}</strong><span>{{ t('packetLoss') }} {{ performanceStats.teamSpeakLossPercent == null ? '—' : `${performanceStats.teamSpeakLossPercent}%` }}</span></article></div>
      <p class="performance-status">{{ performanceRunning ? t('measuring') : performanceStats.ready ? t('measureComplete') : t('measureUnavailable') }}</p>
      <section v-if="screenShareWebRtcStats.peers.length" class="webrtc-stats" aria-live="polite">
        <header><div><strong>{{ t('webrtcStats') }}</strong><small>{{ t('webrtcStatsHint') }}</small></div></header>
        <div v-if="screenShareWebRtcStats.capture" class="webrtc-stats-capture"><span>{{ t('screenShareCapture') }}</span><strong>{{ screenShareWebRtcStats.capture.width ?? '—' }} × {{ screenShareWebRtcStats.capture.height ?? '—' }}</strong><small>{{ screenShareWebRtcStats.capture.frameRate == null ? '—' : `${screenShareWebRtcStats.capture.frameRate.toFixed(1)} FPS` }}</small></div>
        <div v-for="peer in screenShareWebRtcStats.peers" :key="peer.peerId" class="webrtc-stats-peer">
          <div class="webrtc-stats-peer-heading"><strong>{{ peer.direction === 'outbound' ? t('screenShareSending') : t('screenShareReceiving') }}</strong><small>{{ peer.connectionState }} · {{ peer.candidateType ?? '—' }}</small></div>
          <div class="webrtc-stats-values"><span>{{ peer.frameRate == null ? '—' : `${peer.frameRate.toFixed(1)} FPS` }}</span><span>{{ peer.bitrateKbps == null ? '—' : `${Math.round(peer.bitrateKbps)} kbps` }}</span><span>{{ peer.lossPercent == null ? '—' : `${peer.lossPercent.toFixed(2)}%` }} {{ t('packetLoss') }}</span><span>{{ peer.framesDropped == null ? '—' : peer.framesDropped }} {{ t('screenShareDroppedFrames') }}</span><span>{{ peer.jitterMs == null ? '—' : `${Math.round(peer.jitterMs)} ms` }} {{ t('screenShareJitter') }}</span><span>{{ peer.roundTripTimeMs == null ? '—' : `${Math.round(peer.roundTripTimeMs)} ms` }} {{ t('screenShareRtt') }}</span></div>
          <small v-if="peer.codec || peer.qualityLimitationReason" class="webrtc-stats-detail">{{ peer.codec ?? '—' }}<template v-if="peer.qualityLimitationReason"> · {{ peer.qualityLimitationReason }}</template></small>
        </div>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { NetworkPerformanceStats } from "./useNetworkPerformance.js";
import type { ScreenShareWebRtcStats } from "@/features/screenShare";

defineProps<{
  performancePanelOpen: boolean;
  performanceRunning: boolean;
  performanceStats: NetworkPerformanceStats;
  screenShareWebRtcStats: ScreenShareWebRtcStats;
}>();

defineEmits<{
  (e: "toggle-panel"): void;
  (e: "refresh"): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
.network-performance { position: relative; z-index: 8; }
.performance-panel { position: absolute; top: calc(100% + 10px); right: 0; width: 330px; padding: 15px; color: var(--ws-fg); background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 13px; box-shadow: 0 16px 36px color-mix(in srgb, var(--ws-fg) 18%, transparent); }
.performance-panel header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.performance-panel header strong, .performance-panel header small { display: block; }
.performance-panel header strong { font-size: 13px; }
.performance-panel header small { max-width: 255px; margin-top: 4px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.45; }
.performance-refresh { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; color: var(--ws-accent); background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 7px; cursor: pointer; }
.performance-refresh:disabled { cursor: wait; opacity: .55; }
.performance-route { display: flex; align-items: center; gap: 6px; margin: 15px 0 11px; color: var(--ws-fg-muted); font-size: 9px; }
.performance-route span { padding: 4px 6px; background: var(--ws-surface-2); border-radius: 5px; white-space: nowrap; }
.performance-route i { width: 18px; height: 1px; flex: 1; background: var(--ws-accent); opacity: .55; }
.performance-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.performance-metrics article { min-width: 0; padding: 10px; background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 9px; }
.performance-metrics small, .performance-metrics strong, .performance-metrics span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.performance-metrics small { color: var(--ws-fg-muted); font-size: 9px; }
.performance-metrics strong { margin-top: 6px; color: var(--ws-accent); font-size: 18px; }
.performance-metrics span { margin-top: 4px; color: var(--ws-fg-muted); font-size: 9px; }
.performance-status { margin: 11px 0 0; color: var(--ws-fg-muted); font-size: 10px; }
.webrtc-stats { margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--ws-line); }
.webrtc-stats > header { display: block; margin-bottom: 8px; }
.webrtc-stats > header strong, .webrtc-stats > header small { display: block; }
.webrtc-stats > header strong { font-size: 11px; }
.webrtc-stats > header small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 9px; }
.webrtc-stats-capture, .webrtc-stats-peer { padding: 8px 9px; background: var(--ws-surface-2); border: 1px solid var(--ws-line); border-radius: 8px; }
.webrtc-stats-capture { display: flex; align-items: baseline; gap: 7px; margin-bottom: 7px; }
.webrtc-stats-capture span, .webrtc-stats-capture small, .webrtc-stats-peer-heading small, .webrtc-stats-detail { color: var(--ws-fg-muted); font-size: 9px; }
.webrtc-stats-capture strong { margin-left: auto; color: var(--ws-accent); font-size: 11px; }
.webrtc-stats-peer + .webrtc-stats-peer { margin-top: 7px; }
.webrtc-stats-peer-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.webrtc-stats-peer-heading strong { font-size: 10px; }
.webrtc-stats-peer-heading small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.webrtc-stats-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; margin-top: 7px; color: var(--ws-accent); font-size: 10px; font-variant-numeric: tabular-nums; }
.webrtc-stats-detail { display: block; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 740px) {
  .performance-panel { position: fixed; top: calc(60px + env(safe-area-inset-top, 0px)); right: 10px; width: min(340px, calc(100vw - 20px)); }
}

@media (max-width: 390px) {
  .performance-panel { right: 8px; width: min(330px, calc(100vw - 16px)); padding: 13px; }
  .performance-route { gap: 3px; }
  .performance-route span { padding-inline: 4px; font-size: 8px; }
}
</style>
