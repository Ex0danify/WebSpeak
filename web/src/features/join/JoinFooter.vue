<template>
  <footer class="join-footer" role="contentinfo">
    <span>{{ APP_NAME }}</span><span class="footer-separator">·</span><span>{{ t('teamSpeakClient') }}</span><span class="footer-spacer"></span><button type="button" class="clear-local-button" @click="$emit('clear-local-data')">{{ t('clearLocalData') }}</button><span class="footer-separator">·</span><span>{{ t('browserSupport') }}</span>
  </footer>
</template>

<script setup lang="ts">
import { APP_NAME } from "@/shared/lib/brand";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineEmits<{
  (e: "clear-local-data"): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
.join-footer { width: min(1240px, calc(100% - 64px)); margin: 0 auto; position: relative; z-index: 2; display: flex; align-items: center; min-height: 68px; background: var(--ws-surface-0); color: var(--ws-fg-muted); border-top: 1px solid var(--ws-line); font-size: 11px; }
.join-footer a { color: var(--ws-accent); text-decoration: none; }
.join-footer a:hover { color: var(--ws-accent); text-decoration: underline; }
.footer-separator { margin: 0 8px; color: var(--ws-line-strong); }
.footer-spacer { flex: 1; }

.join-page .join-footer { animation: join-fade-up .55s .72s cubic-bezier(.22, 1, .36, 1) both; }

@media (max-width: 740px) {
  .join-footer { width: min(100% - 32px, 560px); min-height: 53px; }
  .join-footer .footer-spacer { display: none; }
  .join-footer span:last-child { margin-left: auto; }
}

.clear-local-button { padding: 0; transition-property: color; color: var(--ws-fg-muted); background: transparent; border: 0; font-size: 10px; cursor: pointer; }
.clear-local-button:hover { color: var(--ws-danger); text-decoration: underline; }
.clear-local-button:focus-visible { outline: 2px solid var(--ws-accent); outline-offset: 2px; border-radius: 2px; }
/* Touch target floor: the footer row is 68px tall, so padding the hit box out to 44px with a
   matching negative margin leaves the tiny text link's own footprint and the row's height unchanged. */
@media (max-width: 740px) {
  .clear-local-button { margin-block: -10px; padding-block: 10px; }
}

.join-page .join-footer { font-size: 12.5px; }

@media (min-width: 741px) {
  .join-footer { min-height: 54px; }
}

@media (max-width: 740px) {
  .join-footer { width: min(100% - 28px, 560px); }
}

/* Latin-script translations need a little more room than Chinese copy. Keep
   the Chinese layout unchanged and use a compact type scale for English and
   German so headings, labels, and actions do not force awkward wrapping. */
:root[lang="en"] .join-footer,
:root[lang="de"] .join-footer { font-size: 11px; }
</style>
