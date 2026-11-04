<template>
  <MenuLabel plain>{{ channelNameText(channel, t) }}</MenuLabel>
  <MenuItem :disabled="current" @select="$emit('switch', channel)"><Icon name="volume" :size="15" />{{ t("switchChannel") }}</MenuItem>
  <MenuItem @select="$emit('copy-name', channel)"><Icon name="copy" :size="15" />{{ t("copyChannelName") }}</MenuItem>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { MenuItem, MenuLabel } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes.js";

defineProps<{ channel: TreeChannel; current: boolean }>();

defineEmits<{
  (e: "switch", channel: TreeChannel): void;
  (e: "copy-name", channel: TreeChannel): void;
}>();

const { t } = useI18n();
</script>
