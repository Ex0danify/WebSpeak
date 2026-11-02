<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm font-medium text-fg">{{ t("connectionQualityLabel") }}</span>
      <span aria-live="polite">
        <Chip :variant="badge.variant" :dot="badge.dot">
          <template v-if="badge.check" #icon><Icon name="check" :size="13" /></template>{{ badge.label }}
        </Chip>
      </span>
    </div>
    <section :aria-labelledby="latencyId">
      <h3 :id="latencyId" :class="sectionTitle">{{ t("connectionLatencySection") }}</h3>
      <dl class="m-0">
        <div :class="row">
          <dt :class="term">{{ t("latencyGateway") }}</dt>
          <dd :class="value">{{ ms(stats.gatewayLatencyMs) }}</dd>
        </div>
        <div :class="row">
          <dt :class="term">{{ t("latencyTeamSpeak") }}</dt>
          <dd :class="value">{{ ms(stats.teamSpeakLatencyMs) }}</dd>
        </div>
        <div :class="row">
          <dt :class="term">{{ t("latencyLostProbes") }}</dt>
          <dd :class="value">{{ percent(stats.gatewayLossPercent) }}</dd>
        </div>
      </dl>
    </section>
    <section :aria-labelledby="voiceId">
      <h3 :id="voiceId" :class="sectionTitle">{{ t("connectionVoiceSection") }}</h3>
      <Banner v-if="!fullStats" variant="info" class="mb-1">{{ t("voiceWebSocketHint") }}</Banner>
      <dl class="m-0">
        <div :class="row">
          <dt :class="term">{{ t("voiceTransport") }}</dt>
          <dd :class="value">{{ voice ? (voice.transport === "webrtc" ? "WebRTC" : "WebSocket") : "—" }}</dd>
        </div>
        <div :class="row">
          <dt :class="term">{{ voice?.transport === "websocket" ? t("voiceJitterEstimated") : t("voiceJitter") }}</dt>
          <dd :class="value">{{ ms(voice?.jitterMs) }}</dd>
        </div>
        <div v-if="fullStats" :class="row">
          <dt :class="term">{{ t("voiceLoss") }}</dt>
          <dd :class="value">{{ percent(voice?.lossPercent) }}</dd>
        </div>
        <div v-if="fullStats" :class="row">
          <dt :class="term">{{ t("voiceConcealed") }}</dt>
          <dd :class="value">{{ percent(voice?.concealedPercent) }}</dd>
        </div>
        <div v-if="voice?.glitches != null" :class="row">
          <dt :class="term">{{ t("voiceDropouts") }}</dt>
          <dd :class="value">
            {{ stats.dropoutsPerMinute == null ? "—" : format.number(stats.dropoutsPerMinute, { maximumFractionDigits: 1 }) }}
          </dd>
        </div>
        <div v-if="fullStats" :class="row">
          <dt :class="term">{{ t("voiceUplink") }}</dt>
          <dd :class="value">
            {{ voice?.uplinkKbps == null ? "—" : format.unit(voice.uplinkKbps, "kilobit-per-second", { maximumFractionDigits: 0 }) }}
          </dd>
        </div>
        <div v-if="fullStats" :class="row">
          <dt :class="term">{{ t("voiceCodec") }}</dt>
          <dd :class="value">{{ voice?.codec ?? "—" }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { Banner } from "@/shared/ui/banner";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useFormat } from "@/shared/i18n/useFormat.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ConnectionStatsData } from "@/features/room/profile/useConnectionStats";

const props = defineProps<{ stats: ConnectionStatsData }>();
const { t } = useI18n();
const format = useFormat();
const latencyId = useId();
const voiceId = useId();

const sectionTitle = "m-0 mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase";
const row = "flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0";
const term = "text-sm text-fg-muted";
const value = "m-0 text-sm font-medium text-fg tabular-nums";

const voice = computed(() => props.stats.voice);
// Only the WebRTC link reports packet loss, concealed audio, bitrate and codec, so the fallback shows what it can measure.
const fullStats = computed(() => voice.value?.transport !== "websocket");

function ms(milliseconds: number | null | undefined): string {
  return milliseconds == null ? "—" : format.unit(milliseconds, "millisecond", { maximumFractionDigits: 0 });
}

function percent(share: number | null | undefined): string {
  return share == null ? "—" : format.percent(share / 100, 1);
}

// Warning and danger carry an icon by themselves, the others get a check or a dot, so the level never rests on color alone.
const badge = computed(() => {
  switch (props.stats.quality) {
    case "excellent":
      return { variant: "success", check: true, dot: false, label: t("qualityExcellent") } as const;
    case "good":
      return { variant: "accent", check: false, dot: true, label: t("qualityGood") } as const;
    case "poor":
      return { variant: "warning", check: false, dot: false, label: t("qualityPoor") } as const;
    case "bad":
      return { variant: "danger", check: false, dot: false, label: t("qualityBad") } as const;
    default:
      return { variant: "neutral", check: false, dot: false, label: t("qualityMeasuring") } as const;
  }
});
</script>
