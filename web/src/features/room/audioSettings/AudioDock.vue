<template>
  <div
    class="mt-3 flex min-w-0 flex-none items-center gap-1.5 rounded-lg border border-line bg-accent-soft p-2.25 text-fg-muted shadow-lg max-compact:bg-surface-2 max-compact:shadow-none compact:absolute compact:right-4.5 compact:bottom-4.5 compact:left-4.5 compact:z-6 compact:mt-0"
    role="toolbar"
    :aria-label="t('desktopAudioControls')"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2 pl-0.5">
      <template v-if="member">
        <Avatar :name="member.nickname" :src="member.avatar || undefined" size="md" surface="surface-2" tint self :speaking="speaking" />
        <span class="flex min-w-0 flex-col gap-0.5">
          <strong class="truncate text-xs leading-none text-fg">{{ nicknameText(member.nickname, t, member.unnamed) }}</strong>
          <span :class="['truncate text-2xs leading-none font-semibold', statusClass[connection]]">{{ statusText }}</span>
        </span>
      </template>
    </div>
    <Tooltip :text="microphoneMuted ? t('unmuteMic') : t('muteMic')"
      ><Button
        :variant="microphoneMuted ? 'softDanger' : 'soft'"
        size="sm"
        icon-only
        :class="buttonClass"
        pressed-tone="none"
        :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
        :pressed="microphoneMuted"
        @click="$emit('toggle-microphone')"
        ><Icon :name="microphoneMuted ? 'mic-off' : 'mic'"
      /></Button>
    </Tooltip>
    <Tooltip :text="outputMuted ? t('unmuteOutput') : t('muteOutput')"
      ><Button
        :variant="outputMuted ? 'softDanger' : 'soft'"
        size="sm"
        icon-only
        :class="buttonClass"
        pressed-tone="none"
        :aria-label="outputMuted ? t('unmuteOutput') : t('muteOutput')"
        :pressed="outputMuted"
        @click="$emit('toggle-output-mute')"
        ><Icon :name="outputMuted ? 'volume-off' : 'volume'"
      /></Button>
    </Tooltip>
    <Tooltip v-if="screenShareStarting" :text="t('screenShareStarting')"
      ><Button
        variant="softWarning"
        size="sm"
        icon-only
        :class="buttonClass"
        aria-busy="true"
        :aria-label="t('screenShareStarting')"
        ><Icon name="monitor" class="motion-safe:animate-share-starting-icon" /></Button
    ></Tooltip>
    <Tooltip v-else-if="screenShareActive" :text="t('stopScreenShare')"
      ><span class="inline-flex"
        ><Popover side="top" align="end" arrow :side-offset="arrowOffset" :label="t('stopScreenShare')" class="w-56">
          <template #trigger>
            <Button variant="softSuccess" size="sm" icon-only :class="buttonClass" :aria-label="t('screenShareStopLabel')"
              ><Icon name="monitor"
            /></Button>
          </template>
          <template #default="{ close }">
            <strong class="block text-sm text-fg">{{ t("screenShareStopTitle") }}</strong>
            <p class="mt-1 text-sm text-fg-muted">{{ t("screenShareStopBody") }}</p>
            <div class="mt-3 flex flex-col gap-2">
              <Button variant="outline" class="w-full" @click="close()">{{ t("cancel") }}</Button>
              <Button
                variant="dangerSoft"
                class="w-full"
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
    <Tooltip v-else-if="screenShareSupported" :text="t('startScreenShare')"
      ><Button
        variant="soft"
        size="sm"
        icon-only
        :class="buttonClass"
        :aria-label="t('startScreenShare')"
        @click="$emit('open-screen-share')"
        ><Icon name="monitor" /></Button
    ></Tooltip>
    <Tooltip :text="optionsLabel"
      ><span class="inline-flex"
        ><Popover
          v-model:open="optionsOpen"
          side="top"
          align="end"
          arrow
          :side-offset="arrowOffset"
          :label="t('audioOptions')"
          class="w-64"
        >
          <template #trigger>
            <Button ref="optionsButton" variant="soft" size="sm" icon-only :class="optionsButtonClass" :aria-label="optionsLabel"
              ><Icon name="settings" /><span
                v-if="accompanimentActive"
                class="absolute top-1 right-1 size-2 rounded-full bg-accent ring-2 ring-surface-1"
                aria-hidden="true"
              ></span
            ></Button>
          </template>
          <label class="flex cursor-pointer items-start justify-between gap-3">
            <span class="min-w-0">
              <strong class="block text-sm text-fg">{{ t("shareAudio") }}</strong>
              <span :id="hintId" class="mt-0.5 block text-xs leading-snug text-fg-muted">{{
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
          <Button variant="outline" class="w-full" @click="openSettings"
            ><Icon name="settings" :size="16" /> {{ t("audioSettings") }}</Button
          >
        </Popover></span
      ></Tooltip
    >
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { Separator } from "@/shared/ui/separator";
import { Switch } from "@/shared/ui/switch";
import { Tooltip } from "@/shared/ui/tooltip";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { nicknameText, type ChannelMember } from "@/features/session";
import type { AudioLinkStatus } from "@/features/room/audioSettings/audioLinkStatus";

const props = defineProps<{
  /** The local user, shown on the left. */
  member: ChannelMember | null;
  speaking: boolean;
  connection: AudioLinkStatus;
  microphoneMuted: boolean;
  outputMuted: boolean;
  accompanimentActive: boolean;
  accompanimentSupported: boolean;
  screenShareActive: boolean;
  screenShareStarting: boolean;
  /** Browsers without screen capture (most phones) get no button. */
  screenShareSupported: boolean;
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
// The dock pads and borders its buttons by 10 px, so the pointer tips land on its top edge instead of stopping just short of it.
const arrowOffset = 10;
const buttonClass = "size-8.5 max-compact:size-11";const optionsButtonClass = `${buttonClass} relative`;

const optionsOpen = ref(false);
const optionsButton = ref<{ $el: HTMLElement } | null>(null);

// The popover item unmounts on close, so the dialog needs the gear as the place to give focus back to.
function openSettings(): void {
  optionsOpen.value = false;
  optionsButton.value?.$el.focus();
  emit("open-settings");
}
const hintId = useId();
const statusClass: Record<AudioLinkStatus, string> = { connected: "text-success", connecting: "text-warning", disconnected: "text-danger" };
const statusText = computed(() =>
  props.connection === "connected"
    ? t("connected")
    : props.connection === "connecting"
      ? t("audioLinkConnecting")
      : t("audioLinkDisconnected"),
);
const optionsLabel = computed(() => (props.accompanimentActive ? t("audioOptionsSharing") : t("audioOptions")));
</script>
