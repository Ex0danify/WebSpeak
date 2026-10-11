<template>
  <Menu :open="Boolean(memberMenu)" :label="memberMenu ? nicknameText(memberMenu.member.nickname, t, memberMenu.member.unnamed) : undefined" :close-label="t('close')" @update:open="(value) => { if (!value) $emit('close'); }" @close-auto-focus="$emit('close-auto-focus', $event)">
    <template #trigger><span class="fixed size-0" :style="memberMenuStyle" aria-hidden="true"></span></template>
    <template v-if="memberMenu">
      <MenuLabel plain>{{ nicknameText(memberMenu.member.nickname, t, memberMenu.member.unnamed) }}</MenuLabel>
      <MenuSlider :model-value="Math.round((volumes[memberMenu.member.id] ?? 1) * 100)" :label="t('memberVolume')" :min="0" :max="400" :key-step="5" :value-text="`${Math.round((volumes[memberMenu.member.id] ?? 1) * 100)}%`" @update:model-value="$emit('set-volume', memberMenu.member.id, $event / 100)" />
      <MenuSeparator />
      <MenuItem @select="$emit('private-message', memberMenu.member.id)"><Icon name="message" :size="15" />{{ t('privateMessage') }}</MenuItem>
      <MenuItem @select="$emit('poke', memberMenu.member)"><Icon name="bell" :size="15" />{{ t('poke') }}</MenuItem>
      <MenuItem @select="$emit('toggle-whisper', memberMenu.member)"><Icon name="mic" :size="15" />{{ whisperTargetIds.has(memberMenu.member.id) ? t('removeWhisperTarget') : t('setWhisperTarget') }}</MenuItem>
      <MenuItem @select="$emit('copy-name', memberMenu.member)"><Icon name="copy" :size="15" />{{ t('copyNickname') }}</MenuItem>
      <MenuSub>
        <template #icon><Icon name="hash" :size="15" /></template>
        <template #label>{{ t('moveMemberMenu') }}</template>
        <MenuItem v-if="moveCurrentChannel" :disabled="moveCurrentSameChannel" @select="$emit('move', memberMenu.member, moveCurrentChannel.id)"><Icon name="users" :size="15" /><span class="min-w-0 flex-1 truncate">{{ t('moveMemberMyChannel') }}</span><small class="ml-auto max-w-[45%] shrink-0 truncate pl-2 text-2xs text-fg-muted">{{ channelNameText(moveCurrentChannel, t) }}</small></MenuItem>
        <MenuItem v-for="targetChannel in moveOtherChannels" :key="targetChannel.id" @select="$emit('move', memberMenu.member, targetChannel.id)"><Icon name="volume" :size="15" /><span class="min-w-0 flex-1 truncate">{{ channelNameText(targetChannel, t) }}</span></MenuItem>
        <p v-if="!moveCurrentChannel && !moveOtherChannels.length" class="m-0 px-2.5 py-2 text-xs text-fg-muted">{{ t('moveMemberNoChannels') }}</p>
      </MenuSub>
    </template>
  </Menu>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { Menu, MenuItem, MenuLabel, MenuSeparator, MenuSlider, MenuSub } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText, nicknameText, type ChannelMember } from "@/features/session";
import type { TreeChannel } from "../roomTypes.js";

defineProps<{
  memberMenu: { member: ChannelMember; x: number; y: number } | null;
  memberMenuStyle: { left?: string; top?: string };
  volumes: Record<number, number>;
  whisperTargetIds: Set<number>;
  moveCurrentChannel: TreeChannel | null;
  moveCurrentSameChannel: boolean;
  moveOtherChannels: TreeChannel[];
}>();

defineEmits<{
  (e: "close"): void;
  (e: "close-auto-focus", event: Event): void;
  (e: "set-volume", id: number, volume: number): void;
  (e: "private-message", id: number): void;
  (e: "poke", member: ChannelMember): void;
  (e: "toggle-whisper", member: ChannelMember): void;
  (e: "copy-name", member: ChannelMember): void;
  (e: "move", member: ChannelMember, channelId: string): void;
}>();

const { t } = useI18n();
</script>
