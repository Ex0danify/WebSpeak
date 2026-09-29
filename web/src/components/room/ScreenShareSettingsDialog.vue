<template>
  <Dialog v-model="open" size="sm" :title="t('screenShareSettings')" :description="t('screenShareSettingsHint')" :close-label="t('close')">
    <div class="grid gap-3.5">
      <Field :label="t('screenShareResolution')"><Select v-model="resolutionPreset"><option v-for="option in resolutionOptions" :key="option.value" :value="option.value">{{ t(option.label) }}</option></Select></Field>
      <Field :label="t('screenShareFrameRate')"><Select v-model="frameRate"><option v-for="fps in frameRateOptions" :key="fps" :value="fps">{{ fps }} FPS</option></Select></Field>
    </div>
    <p class="mb-1 mt-4 text-xs leading-4 text-fg-muted">{{ t('screenShareSettingsNote') }}</p>
    <template #footer>
      <Button variant="ghost" @click="open = false">{{ t('cancel') }}</Button>
      <Button @click="$emit('start')"><Icon name="monitor" size="sm" />{{ t('startScreenShare') }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { useI18n } from "@/i18n/use-i18n.js";
import type { ScreenShareResolutionPreset } from "../../composables/useScreenShare.js";

const open = defineModel<boolean>({ required: true });
const resolutionPreset = defineModel<ScreenShareResolutionPreset>("resolutionPreset", { required: true });
const frameRate = defineModel<number>("frameRate", { required: true });

defineProps<{
  resolutionOptions: Array<{ value: ScreenShareResolutionPreset; label: string }>;
  frameRateOptions: number[];
}>();

defineEmits<{
  (e: "start"): void;
}>();

const { t } = useI18n();
</script>
