<template>
  <aside :class="demoPanel" :aria-label="t('channels')">
    <div class="mb-5 grid gap-1.25">
      <span :class="demoKicker">{{ t("channels") }}</span
      ><strong class="text-lg text-fg">{{ selectedChannelName }}</strong>
    </div>
    <template v-for="channel in channels" :key="channel.id">
      <SpacerRow v-if="parseSpacer(channel.name)" :spacer="parseSpacer(channel.name)!" :depth="0" />
      <div v-else :class="['-mx-2 mt-1 mb-3 rounded-lg px-2 pt-0.75 pb-2.25', selectedChannelId === channel.id && 'bg-accent-soft']">
        <Button
          variant="soft"
          size="row"
          :aria-current="selectedChannelId === channel.id ? 'true' : undefined"
          @click="emit('select', channel.id)"
          ><Icon name="volume" :size="16" /><span class="min-w-0 flex-1 truncate text-left">{{ channel.name }}</span
          ><Count>{{ channel.members.length }}</Count></Button
        >
        <div :class="['grid gap-1.75 pl-5.5 text-caption text-fg-muted', selectedChannelId !== channel.id && 'max-demo:hidden']">
          <span v-for="member in channel.members" :key="member.id" class="flex items-center gap-1.75"
            ><Avatar
              :name="member.name"
              size="xs"
              :speaking="speakingId === member.id"
              :speaking-label="t('speaking')"
              :class="selectedChannelId === channel.id ? '[--avatar-gap:var(--color-accent-soft)]' : ''"
            />{{ member.name }}</span
          >
        </div>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Count } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import { SpacerRow } from "@/shared/ui/spacer";
import { parseSpacer } from "@/shared/lib/parseSpacer";
import { demoKicker, demoPanel } from "./demoPanel";
import type { DemoChannel } from "./demoTypes";

defineProps<{ channels: DemoChannel[]; selectedChannelId: string; selectedChannelName: string; speakingId: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const { t } = useI18n();
</script>
