<template>
  <Popover v-model:open="open" side="bottom" align="end" :label="t('networkPerformance')" class="w-82.5">
    <template #trigger>
      <Button
        variant="accentSoft"
        size="sm"
        square-on-phone
        class="gap-1.5"
        :title="t('networkPerformance')"
        :aria-label="t('networkPerformance')"
        ><Icon name="activity" :size="16" /><span class="font-normal max-compact:hidden">{{ t("networkPerformance") }}</span
        ><span
          v-if="performanceStats.ready && performanceStats.gatewayLatencyMs != null"
          class="font-mono text-2xs font-normal text-fg-muted max-compact:hidden"
          >{{ format.unit(performanceStats.gatewayLatencyMs, "millisecond") }}</span
        ><span class="inline-flex max-compact:hidden"><Icon name="chevron-down" :size="13" /></span
      ></Button>
    </template>
    <header class="flex items-start justify-between gap-3">
      <div>
        <strong class="block text-ui">{{ t("networkPerformance") }}</strong
        ><small class="mt-1 block max-w-63.75 text-2xs leading-snug text-fg-muted">{{ t("networkPerformanceHint") }}</small>
      </div>
      <Tooltip :text="t('measureNow')"
        ><Button
          variant="tinted"
          size="sm"
          icon-only
          class="flex-none"
          :aria-label="t('measureNow')"
          :disabled="performanceRunning"
          @click="$emit('refresh')"
          ><Icon name="refresh" :size="15" /></Button
      ></Tooltip>
    </header>
    <div class="mt-3.75 mb-2.75 flex items-center gap-1.5 text-2xs text-fg-muted max-phone:gap-0.75">
      <span :class="routeStop">{{ t("browser") }}</span
      ><i :class="routeLink"></i><span :class="routeStop">{{ t("webSpeakGateway") }}</span
      ><i :class="routeLink"></i><span :class="routeStop">{{ t("teamSpeakServer") }}</span>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <article :class="metric">
        <small :class="metricLabel">{{ t("browserToGateway") }}</small
        ><strong :class="metricValue">{{
          performanceStats.gatewayLatencyMs == null ? "—" : format.unit(performanceStats.gatewayLatencyMs, "millisecond")
        }}</strong
        ><span :class="metricLabel + ' mt-1'"
          >{{ t("packetLoss") }}
          {{ performanceStats.gatewayLossPercent == null ? "—" : format.percent(performanceStats.gatewayLossPercent / 100, 2) }}</span
        >
      </article>
      <article :class="metric">
        <small :class="metricLabel">{{ t("gatewayToTeamSpeak") }}</small
        ><strong :class="metricValue">{{
          performanceStats.teamSpeakLatencyMs == null ? "—" : format.unit(performanceStats.teamSpeakLatencyMs, "millisecond")
        }}</strong
        ><span :class="metricLabel + ' mt-1'"
          >{{ t("packetLoss") }}
          {{ performanceStats.teamSpeakLossPercent == null ? "—" : format.percent(performanceStats.teamSpeakLossPercent / 100, 2) }}</span
        >
      </article>
    </div>
    <p class="mt-2.75 text-2xs text-fg-muted">
      {{ performanceRunning ? t("measuring") : performanceStats.ready ? t("measureComplete") : t("measureUnavailable") }}
    </p>
    <section v-if="screenShareWebRtcStats.peers.length" class="mt-3.25 border-t border-line pt-3" aria-live="polite">
      <header class="mb-2">
        <div>
          <strong class="block text-caption">{{ t("webrtcStats") }}</strong
          ><small class="mt-0.75 block text-2xs text-fg-muted">{{ t("webrtcStatsHint") }}</small>
        </div>
      </header>
      <div v-if="screenShareWebRtcStats.capture" :class="[statsBox, 'mb-1.75 flex items-baseline gap-1.75']">
        <span class="text-2xs text-fg-muted">{{ t("screenShareCapture") }}</span
        ><strong class="ml-auto text-caption text-accent"
          >{{ screenShareWebRtcStats.capture.width ?? "—" }} × {{ screenShareWebRtcStats.capture.height ?? "—" }}</strong
        ><small class="text-2xs text-fg-muted">{{
          screenShareWebRtcStats.capture.frameRate == null
            ? "—"
            : format.unit(screenShareWebRtcStats.capture.frameRate, "frame-per-second", { maximumFractionDigits: 1, fallback: "FPS" })
        }}</small>
      </div>
      <div v-for="(peer, index) in screenShareWebRtcStats.peers" :key="peer.peerId" :class="[statsBox, index > 0 && 'mt-1.75']">
        <div class="flex items-baseline justify-between gap-2">
          <strong class="text-2xs">{{ peer.direction === "outbound" ? t("screenShareSending") : t("screenShareReceiving") }}</strong
          ><small class="truncate text-2xs text-fg-muted">{{ peer.connectionState }} · {{ peer.candidateType ?? "—" }}</small>
        </div>
        <div class="mt-1.75 grid grid-cols-2 gap-x-2 gap-y-1 text-2xs text-accent tabular-nums">
          <span>{{
            peer.frameRate == null ? "—" : format.unit(peer.frameRate, "frame-per-second", { maximumFractionDigits: 1, fallback: "FPS" })
          }}</span
          ><span>{{
            peer.bitrateKbps == null ? "—" : format.unit(peer.bitrateKbps, "kilobit-per-second", { maximumFractionDigits: 0 })
          }}</span
          ><span>{{ peer.lossPercent == null ? "—" : format.percent(peer.lossPercent / 100, 2) }} {{ t("packetLoss") }}</span
          ><span>{{ peer.framesDropped == null ? "—" : peer.framesDropped }} {{ t("screenShareDroppedFrames") }}</span
          ><span
            >{{ peer.jitterMs == null ? "—" : format.unit(peer.jitterMs, "millisecond", { maximumFractionDigits: 0 }) }}
            {{ t("screenShareJitter") }}</span
          ><span
            >{{ peer.roundTripTimeMs == null ? "—" : format.unit(peer.roundTripTimeMs, "millisecond", { maximumFractionDigits: 0 }) }}
            {{ t("screenShareRtt") }}</span
          >
        </div>
        <small v-if="peer.codec || peer.qualityLimitationReason" class="mt-1.5 block truncate text-2xs text-fg-muted"
          >{{ peer.codec ?? "—" }}<template v-if="peer.qualityLimitationReason"> · {{ peer.qualityLimitationReason }}</template></small
        >
      </div>
    </section>
  </Popover>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Popover } from "@/shared/ui/popover";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useFormat } from "@/shared/i18n/useFormat.js";
import type { NetworkPerformanceStats } from "@/features/room/network/useNetworkPerformance.js";
import type { ScreenShareWebRtcStats } from "@/features/screenShare";

const props = defineProps<{
  performancePanelOpen: boolean;
  performanceRunning: boolean;
  performanceStats: NetworkPerformanceStats;
  screenShareWebRtcStats: ScreenShareWebRtcStats;
}>();

const emit = defineEmits<{
  (e: "toggle-panel"): void;
  (e: "refresh"): void;
}>();

const { t } = useI18n();

// The owner holds the open state and flips it through `toggle-panel`.
const open = computed({
  get: () => props.performancePanelOpen,
  set: (next: boolean) => {
    if (next !== props.performancePanelOpen) emit("toggle-panel");
  },
});
const format = useFormat();

const routeStop = "rounded-sm bg-surface-2 px-1.5 py-1 whitespace-nowrap max-phone:px-1";
const routeLink = "h-px w-4.5 flex-1 bg-accent opacity-55";
const metric = "min-w-0 rounded-md border border-line bg-surface-2 p-2.5";
const metricLabel = "block truncate text-2xs text-fg-muted";
const metricValue = "mt-1.5 block truncate text-lg text-accent";
const statsBox = "rounded-md border border-line bg-surface-2 px-2.25 py-2";
</script>
