<template>
  <MenuLabel plain>{{ nicknameText(member.nickname, t, member.unnamed) }}</MenuLabel>
  <MenuSlider
    :model-value="volumePercent(member.id)"
    :label="t('memberVolume')"
    :min="0"
    :max="400"
    :key-step="5"
    :value-text="`${volumePercent(member.id)}%`"
    :bubble="formatVolumeDb(volumePercent(member.id))"
    :neutral="100"
    @update:model-value="setVolume(member.id, $event / 100)"
    @keydown.m="setMemberMuted(member.id, !isMuted(member.id))"
  >
    <template #action>
      <Button
        variant="softOutline"
        size="xs"
        icon-only
        class="size-6.25"
        :pressed="isMuted(member.id)"
        :title="muteLabel(member.id)"
        :aria-label="muteLabel(member.id)"
        tabindex="-1"
        @click.stop="setMemberMuted(member.id, !isMuted(member.id))"
        ><Icon :name="isMuted(member.id) ? 'volume-off' : 'volume'" :size="14"
      /></Button>
    </template>
  </MenuSlider>
  <MenuSeparator />
  <MenuItem @select="$emit('private-message', member.id)"><Icon name="message" :size="15" />{{ t("privateMessage") }}</MenuItem>
  <MenuItem @select="$emit('poke', member)"><Icon name="bell" :size="15" />{{ t("poke") }}</MenuItem>
  <MenuItem @select="$emit('toggle-whisper', member)"
    ><Icon name="mic" :size="15" />{{ whisperTargetIds.has(member.id) ? t("removeWhisperTarget") : t("setWhisperTarget") }}</MenuItem
  >
  <MenuItem @select="$emit('copy-name', member)"><Icon name="copy" :size="15" />{{ t("copyNickname") }}</MenuItem>
  <MenuSub>
    <template #icon><Icon name="hash" :size="15" /></template>
    <template #label>{{ t("moveMemberMenu") }}</template>
    <MenuItem v-if="moveCurrentChannel" :disabled="moveCurrentSameChannel" @select="$emit('move', member, moveCurrentChannel.id)"
      ><Icon name="users" :size="15" /><span class="min-w-0 flex-1 truncate">{{ t("moveMemberMyChannel") }}</span
      ><small class="ml-auto max-w-[45%] shrink-0 truncate pl-2 text-2xs text-fg-muted">{{
        channelNameText(moveCurrentChannel, t)
      }}</small></MenuItem
    >
    <MenuItem v-for="targetChannel in moveOtherChannels" :key="targetChannel.id" @select="$emit('move', member, targetChannel.id)"
      ><Icon name="volume" :size="15" /><span class="min-w-0 flex-1 truncate">{{ channelNameText(targetChannel, t) }}</span></MenuItem
    >
    <p v-if="!moveCurrentChannel && !moveOtherChannels.length" class="m-0 px-2.5 py-2 text-xs text-fg-muted">
      {{ t("moveMemberNoChannels") }}
    </p>
  </MenuSub>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { MenuItem, MenuLabel, MenuSeparator, MenuSlider, MenuSub } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { channelNameText, nicknameText, type ChannelMember } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes.js";
import { formatVolumeDb } from "@/features/room/contextMenu/volumeDb.js";
import { useRoomContext } from "@/features/room/useRoomContext.js";

defineProps<{
  member: ChannelMember;
  moveCurrentChannel: TreeChannel | null;
  moveCurrentSameChannel: boolean;
  moveOtherChannels: TreeChannel[];
}>();

const { t } = useI18n();
const { roster, audio } = useRoomContext();
const { volumes, mutedMembers, whisperTargetIds } = roster;
const { setVolume, setMemberMuted } = audio;

const volumePercent = (id: number) => Math.round((volumes[id] ?? 1) * 100);

// Mute is its own state: the slider keeps its level while muted and only the audible gain drops to 0.
const isMuted = (id: number) => Boolean(mutedMembers[id]);
const muteLabel = (id: number) => (isMuted(id) ? t("unmuteMember") : t("muteMember"));

defineEmits<{
  (e: "private-message", id: number): void;
  (e: "poke", member: ChannelMember): void;
  (e: "toggle-whisper", member: ChannelMember): void;
  (e: "copy-name", member: ChannelMember): void;
  (e: "move", member: ChannelMember, channelId: string): void;
}>();
</script>
