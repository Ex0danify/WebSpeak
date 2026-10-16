<template>
  <Menu
    :open="Boolean(memberMenu)"
    :label="memberMenu ? nicknameText(memberMenu.member.nickname, t, memberMenu.member.unnamed) : undefined"
    :close-label="t('close')"
    @update:open="
      (value) => {
        if (!value) $emit('close');
      }
    "
    @close-auto-focus="$emit('close-auto-focus', $event)"
  >
    <template #trigger><span class="fixed size-0" :style="memberMenuStyle" aria-hidden="true"></span></template>
    <template v-if="memberMenu">
      <MenuLabel plain>{{ nicknameText(memberMenu.member.nickname, t, memberMenu.member.unnamed) }}</MenuLabel>
      <MenuSlider
        :model-value="volumePercent(memberMenu.member.id)"
        :label="t('memberVolume')"
        :min="0"
        :max="400"
        :key-step="5"
        :value-text="`${volumePercent(memberMenu.member.id)}%`"
        :bubble="formatVolumeDb(volumePercent(memberMenu.member.id))"
        :neutral="100"
        @update:model-value="$emit('set-volume', memberMenu.member.id, $event / 100)"
        @keydown.m="$emit('set-muted', memberMenu.member.id, !isMuted(memberMenu.member.id))"
      >
        <template #action>
          <Button
            variant="softOutline"
            size="xs"
            icon-only
            class="size-6.25"
            :pressed="isMuted(memberMenu.member.id)"
            :title="muteLabel(memberMenu.member.id)"
            :aria-label="muteLabel(memberMenu.member.id)"
            tabindex="-1"
            @click.stop="$emit('set-muted', memberMenu.member.id, !isMuted(memberMenu.member.id))"
            ><Icon :name="isMuted(memberMenu.member.id) ? 'volume-off' : 'volume'" :size="14"
          /></Button>
        </template>
      </MenuSlider>
      <MenuSeparator />
      <MenuItem @select="$emit('private-message', memberMenu.member.id)"
        ><Icon name="message" :size="15" />{{ t("privateMessage") }}</MenuItem
      >
      <MenuItem @select="$emit('poke', memberMenu.member)"><Icon name="bell" :size="15" />{{ t("poke") }}</MenuItem>
      <MenuItem @select="$emit('toggle-whisper', memberMenu.member)"
        ><Icon name="mic" :size="15" />{{
          whisperTargetIds.has(memberMenu.member.id) ? t("removeWhisperTarget") : t("setWhisperTarget")
        }}</MenuItem
      >
      <MenuItem @select="$emit('copy-name', memberMenu.member)"><Icon name="copy" :size="15" />{{ t("copyNickname") }}</MenuItem>
      <MenuSub>
        <template #icon><Icon name="hash" :size="15" /></template>
        <template #label>{{ t("moveMemberMenu") }}</template>
        <MenuItem
          v-if="moveCurrentChannel"
          :disabled="moveCurrentSameChannel"
          @select="$emit('move', memberMenu.member, moveCurrentChannel.id)"
          ><Icon name="users" :size="15" /><span class="min-w-0 flex-1 truncate">{{ t("moveMemberMyChannel") }}</span
          ><small class="ml-auto max-w-[45%] shrink-0 truncate pl-2 text-2xs text-fg-muted">{{
            channelNameText(moveCurrentChannel, t)
          }}</small></MenuItem
        >
        <MenuItem
          v-for="targetChannel in moveOtherChannels"
          :key="targetChannel.id"
          @select="$emit('move', memberMenu.member, targetChannel.id)"
          ><Icon name="volume" :size="15" /><span class="min-w-0 flex-1 truncate">{{ channelNameText(targetChannel, t) }}</span></MenuItem
        >
        <p v-if="!moveCurrentChannel && !moveOtherChannels.length" class="m-0 px-2.5 py-2 text-xs text-fg-muted">
          {{ t("moveMemberNoChannels") }}
        </p>
      </MenuSub>
    </template>
  </Menu>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Menu, MenuItem, MenuLabel, MenuSeparator, MenuSlider, MenuSub } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText, nicknameText, type ChannelMember } from "@/features/session";
import type { TreeChannel } from "../roomTypes.js";
import { formatVolumeDb } from "./volumeDb.js";

const props = defineProps<{
  memberMenu: { member: ChannelMember; x: number; y: number } | null;
  memberMenuStyle: { left?: string; top?: string };
  volumes: Record<number, number>;
  mutedMembers: Record<number, boolean>;
  whisperTargetIds: Set<number>;
  moveCurrentChannel: TreeChannel | null;
  moveCurrentSameChannel: boolean;
  moveOtherChannels: TreeChannel[];
}>();

const volumePercent = (id: number) => Math.round((props.volumes[id] ?? 1) * 100);

// Mute is its own state: the slider keeps its level while muted and only the audible gain drops to 0.
const isMuted = (id: number) => Boolean(props.mutedMembers[id]);
const muteLabel = (id: number) => (isMuted(id) ? t("unmuteMember") : t("muteMember"));

defineEmits<{
  (e: "close"): void;
  (e: "close-auto-focus", event: Event): void;
  (e: "set-volume", id: number, volume: number): void;
  (e: "set-muted", id: number, muted: boolean): void;
  (e: "private-message", id: number): void;
  (e: "poke", member: ChannelMember): void;
  (e: "toggle-whisper", member: ChannelMember): void;
  (e: "copy-name", member: ChannelMember): void;
  (e: "move", member: ChannelMember, channelId: string): void;
}>();

const { t } = useI18n();
</script>
