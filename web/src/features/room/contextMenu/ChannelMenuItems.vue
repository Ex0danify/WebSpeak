<template>
  <MenuItem :disabled="channel.id === currentChannelId" @select="switchChannel(channel)"
    ><Icon name="volume" :size="15" />{{ t("switchChannel") }}</MenuItem
  >
  <MenuItem @select="copyChannelName(channel)"><Icon name="copy" :size="15" />{{ t("copyChannelName") }}</MenuItem>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { MenuItem } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useContextActions } from "@/features/room/contextMenuApi.js";
import type { TreeChannel } from "@/features/room/roomTypes.js";

defineProps<{ channel: TreeChannel }>();

const { t } = useI18n();
const { currentChannelId, switchChannel, copyChannelName } = useContextActions();
</script>
