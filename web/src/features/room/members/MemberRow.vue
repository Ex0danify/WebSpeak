<template>
  <div class="member-row group/row">
    <span class="relative shrink-0"><Avatar :name="member.nickname" :src="member.avatar || undefined" :speaking="speaking" surface="surface-1" class="size-[33px] text-[10px] text-accent-fg group-hover/row:[--avatar-gap:var(--color-surface-2)] group-focus-within/row:[--avatar-gap:var(--color-surface-2)] max-[740px]:size-10 max-[740px]:text-xs" :style="avatarStyle(member.nickname, member.isSelf)" /><span class="absolute -bottom-0.5 -right-0.5 size-[9px] rounded-full border-2 border-surface-1 bg-success max-[740px]:size-2.5" aria-hidden="true"></span></span>
    <div class="member-copy"><strong>{{ memberDisplayName(member, t) }}</strong><span>{{ member.away ? t('away') : speaking ? t('speaking') : member.isSelf ? t('yourDevice') : t('memberOnline') }}</span></div>
    <div class="member-flags" role="group" :aria-label="t('memberStates')"><span v-if="member.away" role="img" :title="t('away')" :aria-label="t('away')"><Icon name="clock" :size="13" /></span><span v-if="member.inputMuted" role="img" :title="t('inputMuted')" :aria-label="t('inputMuted')"><Icon name="mic-off" :size="13" /></span><span v-if="member.outputMuted" role="img" :title="t('outputMuted')" :aria-label="t('outputMuted')"><Icon name="volume-off" :size="13" /></span><span v-if="member.channelCommander" role="img" :title="t('channelCommander')" :aria-label="t('channelCommander')"><Icon name="shield" :size="13" /></span></div>
    <div class="member-volume" :data-member-id="member.id"><Icon :name="volume === 0 ? 'volume-off' : 'volume'" :size="14" /><Slider class="w-[45px]" :min="0" :max="400" :model-value="Math.round(volume * 100)" :value-text="`${Math.round(volume * 100)}%`" :aria-label="t('memberVolume')" @update:model-value="$emit('set-volume', $event / 100)" /></div>
    <button v-if="isMobileViewport && !member.isSelf" type="button" class="member-action-button" :aria-label="t('moreMemberOptions')" @click.stop="$emit('open-actions')"><Icon name="more" :size="18" /></button>
  </div>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Icon } from "@/shared/ui/icon";
import { Slider } from "@/shared/ui/slider";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { avatarStyle } from "@/shared/lib/format.js";
import { memberDisplayName } from "@/features/session";
import type { ChannelMember } from "@/features/session";

defineProps<{
  member: ChannelMember;
  speaking: boolean;
  /** Playback gain as a ratio (1 = 100%). */
  volume: number;
  isMobileViewport: boolean;
}>();

defineEmits<{
  (e: "set-volume", volume: number): void;
  (e: "open-actions"): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
.member-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.member-copy { min-width: 0; flex: 1; }
.member-copy strong, .member-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.member-copy strong { color: var(--ws-fg); font-size: 10px; }
.member-copy span { margin-top: 4px; color: var(--ws-fg-muted); font-size: 9px; }
.member-volume { display: flex; align-items: center; gap: 5px; color: var(--ws-fg-muted); width: 64px; }
@media (max-width: 1200px) {
  .member-volume { display: none; }
}
.member-volume { display: flex; }
.app-shell .member-copy strong { font-size: 12.5px; }
.app-shell .member-copy span { font-size: 11.25px; }
.member-row { position: relative; padding: 4px 6px; margin: -4px -6px; border-radius: 9px; transition: background .16s ease, box-shadow .16s ease; }
.member-row:hover, .member-row:focus-within { background: var(--ws-surface-2); box-shadow: var(--shadow-sm); }
.member-copy strong { color: var(--ws-fg); }
.member-copy span { color: var(--ws-fg-muted); }
.member-row:hover, .member-row:focus-within { background: color-mix(in srgb, var(--ws-accent) 10%, var(--ws-surface-1)); box-shadow: 0 4px 12px color-mix(in srgb, var(--ws-fg) 8%, transparent); }
.member-action-button { display: none; }
@media (max-width: 740px) {
  .member-row { min-height: 58px; margin: 0; padding: 7px 7px; gap: 9px; border-radius: 12px; }
  .member-copy strong { font-size: 14px; }
  .member-copy span { margin-top: 3px; font-size: 12px; }
  .member-flags, .member-volume { display: none; }
  .member-action-button { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; color: var(--ws-fg-muted); background: transparent; border-radius: 10px; cursor: pointer; }
  .member-action-button:hover, .member-action-button:active { color: var(--ws-accent); background: color-mix(in srgb, var(--ws-accent) 14%, var(--ws-surface-1)); }
}
.member-row[draggable="true"] { cursor: grab; touch-action: none; }
.member-row[draggable="true"]:active { cursor: grabbing; }
.member-row.dragging { opacity: .45; }
</style>
