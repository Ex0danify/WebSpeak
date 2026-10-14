<template>
  <Button variant="soft" size="row" :aria-current="active ? 'true' : undefined" :title="t('switchChannel')">
    <Icon name="volume" :size="16" />
    <span class="min-w-0 flex-1 truncate text-md font-bold">{{ channelNameText(channel, t) }}</span>
    <small class="text-ui">{{ channel.members.length }}</small>
  </Button>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText } from "@/features/session";
import type { TreeChannel } from "../roomTypes.js";

defineProps<{
  channel: TreeChannel;
  active: boolean;
}>();

const { t } = useI18n();
</script>
