<template>
  <div class="join-copy">
    <div class="eyebrow"><span class="eyebrow-dot"></span> {{ t('privateAudio') }}</div>
    <h1>{{ t('joinLine1') }}<br /><em>{{ t('joinLine2') }}</em></h1>
    <p class="join-description">{{ welcomeText }}</p>
    <div class="promise-list">
      <div class="promise-item"><span class="promise-icon"><Icon name="waveform" :size="16" /></span><span><b>{{ t('highQuality') }}</b><small>{{ t('opusAudio') }}</small></span></div>
      <div class="promise-item"><span class="promise-icon mint"><Icon name="shield" :size="16" /></span><span><b>{{ t('secureJoin') }}</b><small>{{ t('inviteProtected') }}</small></span></div>
      <div class="promise-item"><span class="promise-icon sand"><Icon name="users" :size="16" /></span><span><b>{{ t('realtime') }}</b><small>{{ t('membersSync') }}</small></span></div>
    </div>
    <div v-if="visitorNumber !== null" class="visitor-count" role="status" aria-live="polite">
      <span class="visitor-count-orbit" aria-hidden="true"></span>
      <span class="visitor-count-icon"><Icon name="users" :size="15" /></span>
      <span class="visitor-count-label">{{ t('visitorCount', { count: visitorNumber }) }}</span>
      <span v-if="visitorTotal !== null" class="visitor-count-divider" aria-hidden="true"></span>
      <span v-if="visitorTotal !== null" class="visitor-count-total">{{ t('visitorTotal', { count: visitorTotal }) }}</span>
      <span class="visitor-count-spark" aria-hidden="true">✦</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  welcomeText: string;
  visitorNumber: number | null;
  visitorTotal: number | null;
}>();

const { t } = useI18n();
</script>

<style scoped>
.join-copy { max-width: 630px; }
.eyebrow { display: flex; align-items: center; gap: 9px; color: var(--ws-accent); font-size: 11px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
.eyebrow-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ws-success); }
.join-copy h1 { margin: 20px 0 18px; color: var(--ws-fg); font-size: clamp(42px, 5.3vw, 72px); font-weight: 700; line-height: 1.04; letter-spacing: -.075em; }
.join-copy h1 em { color: var(--ws-accent); font-style: normal; }
.join-description { max-width: 500px; margin: 0; color: var(--ws-fg-muted); font-size: 17px; line-height: 1.75; }
.promise-list { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 42px; }
.promise-item { display: flex; align-items: center; gap: 10px; min-width: 160px; }
.promise-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: var(--ws-accent); background: var(--ws-accent-soft); }
.promise-icon.mint { color: var(--ws-success); background: var(--ws-success-soft); }
.promise-icon.sand { color: var(--ws-warning); background: var(--ws-warning-soft); }
.promise-item b, .promise-item small { display: block; }
.promise-item b { color: var(--ws-fg); font-size: 12px; }
.promise-item small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 10px; }
.visitor-count { position: relative; display: inline-flex; align-items: center; gap: 10px; width: fit-content; max-width: 100%; min-height: 42px; margin: 30px 0 0; padding: 7px 14px 7px 9px; overflow: hidden; color: var(--ws-accent); border: 1px solid color-mix(in srgb, var(--ws-accent) 42%, transparent); border-radius: 999px; background: linear-gradient(110deg, color-mix(in srgb, var(--ws-accent-soft) 94%, transparent), color-mix(in srgb, var(--ws-surface-1) 78%, transparent)); box-shadow: 0 10px 24px color-mix(in srgb, var(--ws-accent) 10%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--ws-surface-1) 55%, transparent); font-size: 12px; font-weight: 700; line-height: normal; letter-spacing: .035em; }
.visitor-count::before { position: absolute; top: 0; bottom: 0; left: -45%; width: 38%; background: linear-gradient(105deg, transparent, color-mix(in srgb, var(--ws-surface-1) 62%, transparent), transparent); content: ""; pointer-events: none; transform: skewX(-18deg); animation: visitor-shimmer 3.6s 1.5s ease-in-out infinite; }
.visitor-count-orbit { position: absolute; top: -20px; right: 12px; width: 51px; height: 51px; border: 1px solid color-mix(in srgb, var(--ws-accent) 32%, transparent); border-radius: 50%; pointer-events: none; animation: visitor-orbit 4s ease-in-out infinite; }
.visitor-count-icon { position: relative; z-index: 1; display: grid; place-items: center; width: 27px; height: 27px; flex: 0 0 auto; color: var(--ws-accent-fg); border-radius: 50%; background: linear-gradient(135deg, var(--ws-accent), var(--ws-accent)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ws-accent) 12%, transparent), 0 0 18px color-mix(in srgb, var(--ws-accent) 24%, transparent); }
.visitor-count-label { position: relative; z-index: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visitor-count-divider { position: relative; z-index: 1; width: 1px; height: 18px; flex: 0 0 auto; background: currentColor; opacity: .24; }
.visitor-count-total { position: relative; z-index: 1; min-width: 0; overflow: hidden; color: inherit; font-size: .92em; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; opacity: .78; }
.visitor-count-spark { position: relative; z-index: 1; color: var(--ws-accent); font-size: 15px; line-height: 1; animation: visitor-spark 2.1s ease-in-out infinite; }

@keyframes visitor-shimmer { 0%, 42% { left: -45%; } 72%, 100% { left: 130%; } }
@keyframes visitor-spark { 0%, 100% { opacity: .58; transform: scale(.88) rotate(0deg); } 50% { opacity: 1; transform: scale(1.14) rotate(12deg); } }
@keyframes visitor-orbit { 0%, 100% { transform: rotate(-8deg) scale(.96); opacity: .48; } 50% { transform: rotate(12deg) scale(1.04); opacity: .9; } }

.join-page .join-copy .eyebrow { animation: join-fade-up .55s .08s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .join-copy h1 { animation: join-title-in .78s .16s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .join-copy h1 em { display: inline-block; animation: join-accent-breathe 5s 1.15s ease-in-out infinite; }
.join-page .join-description { animation: join-fade-up .58s .36s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .promise-list { animation: join-fade-up .58s .48s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .promise-item:nth-child(2) { animation: join-fade-up .58s .58s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .promise-item:nth-child(3) { animation: join-fade-up .58s .68s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .visitor-count { animation: join-fade-up .58s .76s cubic-bezier(.22, 1, .36, 1) both; }
.join-page .eyebrow-dot { animation: join-dot-pulse 2.8s .8s ease-in-out infinite; }

/* JoinView.vue's own `.join-page *` reduced-motion rule only reaches this
   component's root (`.join-copy`) through scoped-CSS root fallthrough, not the
   animated elements nested inside it, so the catch-all is repeated here. */
@media (prefers-reduced-motion: reduce) {
  .join-copy *, .join-copy *::before, .join-copy *::after { animation: none !important; transition-duration: .01ms !important; }
}

@media (max-width: 740px) {
  .join-copy h1 { margin-top: 15px; font-size: 45px; }
  .join-description { font-size: 14px; }
  .promise-list { gap: 13px; margin-top: 27px; }
  .promise-item { min-width: 0; flex: 1 1 30%; }
  .promise-item small { display: none; }
  .visitor-count { margin-top: 24px; }
}
@media (max-width: 420px) {
  .join-copy h1 { font-size: 38px; }
  .promise-list { display: grid; grid-template-columns: 1fr; }
  .promise-item small { display: block; }
}

/* Increase connected-view typography by 25% (this component's share of that rule). */
.join-page .eyebrow { font-size: 13.75px; }
.join-page .join-copy h1 { font-size: clamp(52px, 6.6vw, 90px); }
.join-page .join-description { font-size: 21.25px; }
.join-page .promise-item b { font-size: 15px; }
.join-page .promise-item small { font-size: 12.5px; }
.join-page .visitor-count { font-size: 15px; }

@media (max-width: 740px) {
  .join-copy h1 { margin: 14px 0 14px; font-size: clamp(40px, 12vw, 58px); }
  .join-description { font-size: 15px; line-height: 1.65; }
  .promise-list { margin-top: 23px; }
}

.join-description { color: var(--ws-fg-muted); }

/* Latin-script translations need a little more room than Chinese copy (this
   component's share of that rule). */
:root[lang="en"] .eyebrow,
:root[lang="de"] .eyebrow { font-size: 12px; }
:root[lang="en"] .join-copy h1,
:root[lang="de"] .join-copy h1 { font-size: clamp(46px, 5.8vw, 79px); }
:root[lang="en"] .join-description,
:root[lang="de"] .join-description { font-size: 18px; }
:root[lang="en"] .promise-item b,
:root[lang="de"] .promise-item b { font-size: 13.2px; }
:root[lang="en"] .promise-item small,
:root[lang="de"] .promise-item small { font-size: 11px; }

@media (max-width: 740px) {
  :root[lang="en"] .join-copy h1,
  :root[lang="de"] .join-copy h1 { font-size: clamp(35px, 10.6vw, 51px); }
  :root[lang="en"] .join-description,
  :root[lang="de"] .join-description { font-size: 13.2px; }
}
</style>
