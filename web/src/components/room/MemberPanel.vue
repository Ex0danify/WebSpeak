<template>
  <div :class="['member-panel', { 'mobile-section-visible': mobileSection === 'channels' }]" :role="isMobileViewport && mobileSection === 'channels' ? 'main' : 'complementary'">
    <h1 v-if="isMobileViewport && mobileSection === 'channels'" class="sr-only">{{ t('voiceSpace') }}</h1>
    <div class="member-panel-heading"><div><span class="section-kicker">{{ t('people') }}</span><h2>{{ t('people') }}</h2></div><Button variant="outline" size="sm" :class="`gap-1.5 font-normal hover:border-warning/30 hover:bg-warning-soft hover:text-warning max-[740px]:h-[34px] ${away ? 'border-warning/30 bg-warning-soft text-warning' : 'border-line bg-surface-0 text-fg-muted'}`" @click="$emit('toggle-away')"><span :class="['size-[7px] rounded-full', away ? 'bg-warning' : 'bg-success']" aria-hidden="true"></span>{{ away ? t('away') : t('available') }}</Button></div>
    <Input v-model="memberQuery" class="mt-[18px] shrink-0 max-[740px]:mt-3.5 [&>span]:h-8 max-[740px]:[&>span]:h-11" input-class="h-8 border-transparent bg-surface-2 text-[13.75px] max-[740px]:h-11 max-[740px]:text-[15px]" :placeholder="t('searchMembers')" :aria-label="t('searchMembers')"><template #leading><Icon name="search" :size="15" /></template></Input>
    <slot />
    <div v-if="!hasMatches" class="member-empty">{{ t('noMatchingMembers') }}</div>
    <slot name="footer" />
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/use-i18n.js";

defineProps<{
  mobileSection: "channels" | "chat" | "voice" | "more";
  isMobileViewport: boolean;
  away: boolean;
  /** False when the search filter leaves no channel visible. */
  hasMatches: boolean;
}>();

defineEmits<{
  (e: "toggle-away"): void;
}>();

const memberQuery = defineModel<string>("memberQuery", { default: "" });

const { t } = useI18n();
</script>

<style scoped>
/* .section-kicker is shared with .voice-section's heading, still styled in
   WebClient.vue — duplicated here since the people heading now renders
   inside this component (same note as ChatPanel). */
.section-kicker { color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
.app-shell .section-kicker { font-size: 12.5px; }
.member-panel { min-width: 0; padding: 26px 16px; color: var(--ws-fg); background: var(--ws-surface-1); border-left: 1px solid var(--ws-line); }
.member-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; }
.member-panel-heading h2 { margin: 5px 0 0; color: var(--ws-fg); font-size: 19px; font-weight: 700; letter-spacing: -.04em; }
.member-empty { margin-top: 22px; color: var(--ws-fg-muted); font-size: 10px; text-align: center; }
@media (max-width: 1200px) {
  .member-panel { padding-inline: 12px; }
}
@media (max-width: 980px) {
  .member-panel { display: none; }
}
@media (max-width: 740px) {
  .member-panel { display: none; }
}
.member-panel { display: flex; flex-direction: column; min-height: 0; padding: 26px 18px 18px; overflow: hidden; }
.app-shell .member-panel-heading h2 { font-size: 23.75px; }
.app-shell .member-empty { font-size: 12.5px; }
@media (min-width: 741px) and (max-width: 980px) {
  .member-panel { display: none; }
}
@media (max-width: 980px) {
  .member-panel { display: flex; border-top: 1px solid var(--ws-line); border-left: 0; padding: 16px 18px; }
}
.member-panel { grid-column: 1; grid-row: 1; border-right: 1px solid var(--ws-line); border-left: 0; }
@media (max-width: 980px) {
  .member-panel { grid-column: 1; grid-row: 2; display: flex; border-top: 1px solid var(--ws-line); border-right: 0; padding: 16px 18px; }
}
.member-panel-heading { align-items: flex-end; }
.member-panel { background: var(--ws-surface-1); border-color: var(--ws-line); }
.member-panel { box-shadow: 0 7px 18px color-mix(in srgb, var(--ws-fg) 8%, transparent); }
.member-panel-heading h2 { color: var(--ws-fg); }
@media (max-width: 740px) {
  .app-shell .member-panel { display: none !important; order: 2; width: 100%; max-height: calc(100dvh - 142px); min-height: 235px; padding: 18px 15px 24px; border-top: 1px solid var(--ws-line); border-right: 0; overflow: hidden; }
  .app-shell .member-panel.mobile-section-visible { display: flex !important; }
}
@media (max-width: 740px) {
  .app-shell .member-panel.mobile-section-visible { flex: 1 1 auto; min-height: 0; max-height: none; }
}
@media (max-width: 740px) {
  .app-shell .member-panel.mobile-section-visible { display: flex !important; flex: 1 1 auto; width: 100%; height: auto; min-height: 0; max-height: none; padding: 18px 14px 16px; border-top: 0; border-right: 0; overflow: hidden; }
  .member-panel-heading { flex: 0 0 auto; }
  .member-panel-heading h2 { font-size: 23px; }
}
@media (min-width: 741px) {
  .app-shell .member-panel { position: relative; overflow: visible; padding-bottom: calc(18px + 12px + 52px); }
}
</style>
