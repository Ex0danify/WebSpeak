<template>
  <Dialog v-model="open" size="sm" :title="t('screenShareSettings')" :description="t('screenShareSettingsHint')" :close-label="t('close')">
    <div class="grid gap-3.5">
      <Field :label="t('screenShareResolution')"
        ><Select v-model="resolutionPreset"
          ><option v-for="option in resolutionOptions" :key="option.value" :value="option.value">{{ t(option.label) }}</option></Select
        ></Field
      >
      <Field :label="t('screenShareFrameRate')"
        ><Select v-model="frameRate"
          ><option v-for="fps in frameRateOptions" :key="fps" :value="fps">
            {{ format.unit(fps, "frame-per-second", { fallback: "FPS" }) }}
          </option></Select
        ></Field
      >
    </div>
    <p class="mt-4 mb-1 text-xs leading-4 text-fg-muted">{{ t("screenShareSettingsNote") }}</p>
    <template #footer>
      <Button variant="ghost" @click="open = false">{{ t("cancel") }}</Button>
      <Button @click="$emit('start')"><Icon name="monitor" size="sm" />{{ t("startScreenShare") }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useFormat } from "@/shared/i18n/useFormat.js";
import type { MessageKey } from "@/shared/i18n/messageKeys";
import type { ScreenShareResolutionPreset } from "./useScreenShare.js";

const open = defineModel<boolean>({ required: true });
const resolutionPreset = defineModel<ScreenShareResolutionPreset>("resolutionPreset", { required: true });
const frameRate = defineModel<number>("frameRate", { required: true });

defineProps<{
  resolutionOptions: Array<{ value: ScreenShareResolutionPreset; label: MessageKey }>;
  frameRateOptions: number[];
}>();

defineEmits<{
  (e: "start"): void;
}>();

const { t } = useI18n();
const format = useFormat();
</script>
