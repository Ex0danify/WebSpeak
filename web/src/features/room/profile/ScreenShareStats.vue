<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm font-medium text-fg">{{ t("screenShareStatsLabel") }}</span>
      <span aria-live="polite">
        <Chip :variant="badge.variant" :dot="badge.dot">{{ badge.label }}</Chip>
      </span>
    </div>
    <section :aria-labelledby="captureId">
      <h3 :id="captureId" :class="sectionTitle">{{ t("screenShareCapture") }}</h3>
      <dl class="m-0">
        <div v-for="item in captureRows" :key="item.label" :class="row">
          <dt :class="term">{{ item.label }}</dt>
          <dd :class="value">{{ item.text }}</dd>
        </div>
      </dl>
    </section>
    <section v-for="(stream, index) in streams" :key="stream.id" :aria-labelledby="`${streamId}-${index}`">
      <h3 :id="`${streamId}-${index}`" :class="sectionTitle">{{ stream.title }}</h3>
      <dl class="m-0">
        <div v-for="item in stream.rows" :key="item.label" :class="row">
          <dt :class="term">{{ item.label }}</dt>
          <dd :class="value">{{ item.text }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { Chip } from "@/shared/ui/chip";
import { useFormat } from "@/shared/i18n/useFormat.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ScreenShareWebRtcStats } from "@/features/screenShare";
import { row, sectionTitle, term, value } from "@/features/room/profile/statsClasses";

const props = defineProps<{ stats: ScreenShareWebRtcStats }>();
const { t } = useI18n();
const format = useFormat();
const captureId = useId();
const streamId = useId();

const DASH = "—";

const sending = computed(() => props.stats.peers.some((peer) => peer.direction === "outbound"));
const receiving = computed(() => props.stats.peers.some((peer) => peer.direction !== "outbound"));

// Sharing wins when someone is both sending and watching, the capture only exists for the sender.
const badge = computed(() => {
  if (sending.value) return { variant: "success", dot: true, label: t("screenShareStateSharing") } as const;
  if (receiving.value) return { variant: "accent", dot: true, label: t("screenShareStateWatching") } as const;
  return { variant: "neutral", dot: false, label: t("screenShareStateIdle") } as const;
});

function fps(rate: number | null | undefined): string {
  return rate == null ? DASH : format.unit(rate, "frame-per-second", { maximumFractionDigits: 1, fallback: "FPS" });
}

function ms(milliseconds: number | null | undefined): string {
  return milliseconds == null ? DASH : format.unit(milliseconds, "millisecond", { maximumFractionDigits: 0 });
}

const captureRows = computed(() => {
  const capture = props.stats.capture;
  // One row, so the column stays shorter than the connection one next to it and does not need to scroll.
  return [
    {
      label: t("shareStatsResolution"),
      text: capture ? `${capture.width ?? DASH} × ${capture.height ?? DASH} · ${fps(capture.frameRate)}` : DASH,
    },
  ];
});

type Peer = ScreenShareWebRtcStats["peers"][number];

function peerRows(peer: Peer | null) {
  const rows = [
    { label: t("screenShareConnection"), text: peer ? `${peer.connectionState} · ${peer.candidateType ?? DASH}` : DASH },
    { label: t("shareStatsFrameRate"), text: fps(peer?.frameRate) },
    {
      label: t("screenShareBitrate"),
      text: peer?.bitrateKbps == null ? DASH : format.unit(peer.bitrateKbps, "kilobit-per-second", { maximumFractionDigits: 0 }),
    },
    { label: t("screenSharePacketLoss"), text: peer?.lossPercent == null ? DASH : format.percent(peer.lossPercent / 100, 2) },
    { label: t("screenShareDroppedFrames"), text: peer?.framesDropped == null ? DASH : String(peer.framesDropped) },
    { label: t("screenShareJitter"), text: ms(peer?.jitterMs) },
    { label: t("screenShareRtt"), text: ms(peer?.roundTripTimeMs) },
    { label: t("screenShareCodec"), text: peer?.codec ?? DASH },
  ];
  if (peer?.qualityLimitationReason) rows.push({ label: t("screenShareLimitedBy"), text: peer.qualityLimitationReason });
  return rows;
}

// Without a share one empty group keeps the column as tall as it is during one.
const streams = computed(() =>
  props.stats.peers.length
    ? props.stats.peers.map((peer) => ({
        id: peer.peerId,
        title: peer.direction === "outbound" ? t("screenShareSending") : t("screenShareReceiving"),
        rows: peerRows(peer),
      }))
    : [{ id: "idle", title: t("screenShareStream"), rows: peerRows(null) }],
);
</script>
