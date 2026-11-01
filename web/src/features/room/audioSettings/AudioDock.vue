<template>
  <div
    class="mt-3 flex min-w-0 flex-none items-center gap-1.5 rounded-lg border border-line bg-accent-soft p-2.25 text-fg-muted shadow-lg max-compact:hidden compact:absolute compact:right-4.5 compact:bottom-4.5 compact:left-4.5 compact:z-6 compact:mt-0"
    role="toolbar"
    :aria-label="t('desktopAudioControls')"
  >
    <Tooltip :text="microphoneMuted ? t('unmuteMic') : t('muteMic')"
      ><Button
        variant="soft"
        size="sm"
        icon-only
        class="size-8.5"
        :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
        :pressed="microphoneMuted"
        @click="$emit('toggle-microphone')"
        ><Icon :name="microphoneMuted ? 'mic-off' : 'mic'"
      /></Button>
    </Tooltip>
    <Tooltip :text="outputMuted ? t('unmuteOutput') : t('muteOutput')"
      ><Button
        variant="soft"
        size="sm"
        icon-only
        class="size-8.5"
        :aria-label="outputMuted ? t('unmuteOutput') : t('muteOutput')"
        :pressed="outputMuted"
        @click="$emit('toggle-output-mute')"
        ><Icon :name="outputMuted ? 'volume-off' : 'volume'"
      /></Button>
    </Tooltip>
    <span class="flex-1"></span>
    <Button
      v-if="screenShareStarting"
      variant="soft"
      size="sm"
      icon-only
      loading
      disabled
      class="size-8.5"
      :aria-label="t('screenShareStarting')"
    />
    <Tooltip v-else-if="screenShareActive" :text="t('stopScreenShare')"
      ><span class="inline-flex"
        ><Popover side="top" align="end" :label="t('stopScreenShare')" class="w-64">
          <template #trigger>
            <Button variant="primary" size="sm" icon-only class="size-8.5" :aria-label="t('screenShareStopLabel')"
              ><Icon name="monitor"
            /></Button>
          </template>
          <template #default="{ close }">
            <strong class="block text-caption text-fg">{{ t("screenShareStopTitle") }}</strong>
            <p class="mt-1 text-2xs text-fg-muted">{{ t("screenShareStopBody") }}</p>
            <div class="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" @click="close()">{{ t("cancel") }}</Button>
              <Button
                variant="dangerSoft"
                size="sm"
                @click="
                  close();
                  $emit('stop-screen-share');
                "
                >{{ t("stopScreenShare") }}</Button
              >
            </div>
          </template>
        </Popover></span
      ></Tooltip
    >
    <Tooltip v-else :text="t('startScreenShare')"
      ><Button variant="soft" size="sm" icon-only class="size-8.5" :aria-label="t('startScreenShare')" @click="$emit('open-screen-share')"
        ><Icon name="monitor" /></Button
    ></Tooltip>
    <Tooltip :text="optionsLabel"
      ><span class="inline-flex"
        ><Popover v-model:open="optionsOpen" side="top" align="end" :label="t('audioOptions')" class="w-64">
          <template #trigger>
            <Button ref="optionsButton" variant="soft" size="sm" icon-only class="relative size-8.5" :aria-label="optionsLabel"
              ><Icon name="settings" /><span
                v-if="accompanimentActive"
                class="absolute top-1 right-1 size-2 rounded-full bg-accent ring-2 ring-surface-1"
                aria-hidden="true"
              ></span
            ></Button>
          </template>
          <label class="flex cursor-pointer items-start justify-between gap-3">
            <span class="min-w-0">
              <strong class="block text-caption text-fg">{{ t("shareAudio") }}</strong>
              <span :id="hintId" class="mt-0.5 block text-2xs leading-snug text-fg-muted">{{
                accompanimentSupported ? t("shareAudioHint") : t("accompanimentUnsupported")
              }}</span>
            </span>
            <Switch
              :model-value="accompanimentActive"
              :disabled="!accompanimentSupported"
              :aria-label="t('shareAudio')"
              :aria-describedby="hintId"
              @update:model-value="$emit('toggle-accompaniment')"
            />
          </label>
          <Separator class="my-3" />
          <Button variant="outline" size="sm" class="w-full" @click="openSettings"
            ><Icon name="settings" :size="15" /> {{ t("audioSettings") }}</Button
          >
        </Popover></span
      ></Tooltip
    >
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { Separator } from "@/shared/ui/separator";
import { Switch } from "@/shared/ui/switch";
import { Tooltip } from "@/shared/ui/tooltip";
import { useI18n } from "@/shared/i18n/useI18n.js";

const props = defineProps<{
  microphoneMuted: boolean;
  outputMuted: boolean;
  accompanimentActive: boolean;
  accompanimentSupported: boolean;
  screenShareActive: boolean;
  screenShareStarting: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-microphone"): void;
  (e: "toggle-output-mute"): void;
  (e: "toggle-accompaniment"): void;
  (e: "open-settings"): void;
  (e: "open-screen-share"): void;
  (e: "stop-screen-share"): void;
}>();

const { t } = useI18n();
const optionsOpen = ref(false);
const optionsButton = ref<{ $el: HTMLElement } | null>(null);

// The popover item unmounts on close, so the dialog needs the gear as the place to give focus back to.
function openSettings(): void {
  optionsOpen.value = false;
  optionsButton.value?.$el.focus();
  emit("open-settings");
}
const hintId = useId();
const optionsLabel = computed(() => (props.accompanimentActive ? t("audioOptionsSharing") : t("audioOptions")));
</script>
