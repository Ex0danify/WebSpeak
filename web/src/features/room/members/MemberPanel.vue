<template>
  <div
    :class="[panelClass, mobileSection === 'channels' ? 'flex' : 'hidden compact:flex']"
    :role="isMobileViewport && mobileSection === 'channels' ? 'main' : 'complementary'"
  >
    <h1 v-if="isMobileViewport && mobileSection === 'channels'" class="sr-only">{{ t("voiceSpace") }}</h1>
    <div class="flex items-end justify-between max-compact:shrink-0">
      <div>
        <span class="text-ui font-bold tracking-kicker text-fg-muted">{{ t("people") }}</span>
        <h2 class="mt-1.25 text-2xl font-bold tracking-brand text-fg">{{ t("people") }}</h2>
      </div>
      <Button :variant="away ? 'warning' : 'outline'" size="sm" class="gap-1.5 max-compact:h-8.5" @click="$emit('toggle-away')"
        ><span :class="['size-1.75 rounded-full', away ? 'bg-warning' : 'bg-success']" aria-hidden="true"></span
        >{{ away ? t("away") : t("available") }}</Button
      >
    </div>
    <Input
      v-model="memberQuery"
      class="mt-4.5 shrink-0 max-compact:mt-3.5 [&>span]:h-8 max-compact:[&>span]:h-11"
      input-class="h-8 border-transparent bg-surface-2 text-sm max-compact:h-11 max-compact:text-md"
      :placeholder="t('searchMembers')"
      :aria-label="t('searchMembers')"
      ><template #leading><Icon name="search" :size="15" /></template
    ></Input>
    <slot />
    <div v-if="!hasMatches" class="mt-5.5 text-center text-ui text-fg-muted">{{ t("noMatchingMembers") }}</div>
    <slot name="footer" />
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { useI18n } from "@/shared/i18n/useI18n.js";

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

// Panel frame. Grid cell 1/1 on desktop, row 2 below 980 px; on phones it is the "channels"
// section and fills the screen. Shown by the root's display class.
const panelClass =
  "col-start-1 row-start-1 min-h-0 min-w-0 flex-col overflow-hidden border-line bg-surface-1 px-3.5 pt-4.5 pb-4 text-fg shadow-sm " +
  "max-medium:row-start-2 max-compact:w-full max-compact:flex-auto " +
  "compact:relative compact:overflow-visible compact:px-4.5 compact:pt-4 compact:pb-20.5 " +
  "compact:max-medium:border-t medium:border-r medium:pt-6.5";
</script>
