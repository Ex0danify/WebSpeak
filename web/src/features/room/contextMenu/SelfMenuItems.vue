<template>
  <MenuSlider
    ref="gate"
    live
    :model-value="gateDb"
    :label="t('voxThreshold')"
    :min="VOX_DB_MIN"
    :max="VOX_DB_MAX"
    :value-text="gateText"
    :bubble="gateText"
    :neutral="voxToDb(DEFAULT_VOX_THRESHOLD)"
    @update:model-value="setVoxThreshold(dbToVox($event))"
  />
  <MenuSlider
    thick
    :model-value="Math.round(outputVolume * 100)"
    :label="t('outputVolume')"
    :key-step="5"
    :value-text="`${Math.round(outputVolume * 100)}%`"
    :bubble="`${Math.round(outputVolume * 100)}%`"
    :neutral="100"
    @update:model-value="setOutputVolume($event / 100)"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MenuSlider } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ChannelMember } from "@/features/session";
import {
  DEFAULT_VOX_THRESHOLD,
  MIC_LEVEL_GAIN,
  VOX_DB_MAX,
  VOX_DB_MIN,
  dbToVox,
  formatVoxDb,
  levelToShare,
  releaseLevel,
  voxToDb,
} from "@/features/voice";
import { useRoomContext } from "@/features/room/useRoomContext.js";

defineProps<{ member: ChannelMember }>();

const { t } = useI18n();
const { voxThreshold, outputVolume, micLevel, setVoxThreshold, setOutputVolume } = useRoomContext().audio;

// The live level is the capture RMS times MIC_LEVEL_GAIN, drawn on the slider's dB range.
const gate = ref<InstanceType<typeof MenuSlider> | null>(null);
let shown = 0;
watch(
  [micLevel, gate],
  ([level, slider]) => {
    const share = levelToShare(level / MIC_LEVEL_GAIN);
    shown = releaseLevel(shown, share);
    slider?.setLevel(shown);
  },
  { flush: "post", immediate: true },
);
const gateDb = computed(() => voxToDb(voxThreshold.value));
const gateText = computed(() => formatVoxDb(gateDb.value));
</script>
