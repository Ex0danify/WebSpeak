<template>
  <Popover side="bottom" align="end" :label="t('settings')" class="w-64">
    <template #trigger>
      <Button variant="ghost" size="sm" icon-only :class="buttonClass" :aria-label="t('settings')" :title="t('settings')">
        <Icon name="settings" />
      </Button>
    </template>
    <div class="flex flex-col gap-4">
      <section :aria-labelledby="themeId">
        <h3 :id="themeId" :class="sectionTitle">{{ t("themeLabel") }}</h3>
        <Segmented v-model="theme" fill :aria-labelledby="themeId">
          <Segment v-for="option in themeOptions" :key="option.value" :value="option.value" :aria-label="option.label" :title="option.label">
            <Icon :name="option.icon" :size="18" />
          </Segment>
        </Segmented>
      </section>
      <section>
        <h3 :class="sectionTitle">{{ t("languageMenu") }}</h3>
        <ListSelect v-model="selectedLanguage" :items="languageItems" :aria-label="t('languageMenu')">
          <template #value="{ item }">
            <span class="font-emoji leading-none" aria-hidden="true">{{ flagOf(item?.value) }}</span> {{ item?.label }}
          </template>
          <template #item="{ item }">
            <span class="font-emoji leading-none" aria-hidden="true">{{ flagOf(item.value) }}</span> {{ item.label }}
          </template>
        </ListSelect>
      </section>
    </div>
  </Popover>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { ListSelect } from "@/shared/ui/select";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { LANGUAGES } from "@/shared/i18n/languages";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ThemeMode } from "@/shared/services/theme.js";

const props = defineProps<{
  themeMode: ThemeMode;
  buttonClass?: string;
}>();

const emit = defineEmits<{
  (e: "select-theme", mode: ThemeMode): void;
  (e: "language-change"): void;
}>();

const { language, t } = useI18n();
const themeId = useId();

const sectionTitle = "m-0 mb-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase";

const themeOptions = computed(() => [
  { value: "system", label: t("themeSystem"), icon: "monitor" },
  { value: "light", label: t("themeLight"), icon: "sun" },
  { value: "dark", label: t("themeDark"), icon: "moon" },
] as const);

const theme = computed({
  get: () => props.themeMode,
  set: (mode) => {
    if (mode) emit("select-theme", mode as ThemeMode);
  },
});

const languageItems = LANGUAGES.map((entry) => ({ value: entry.code, label: entry.endonym }));
const flagOf = (code: string | undefined) => LANGUAGES.find((entry) => entry.code === code)?.flag;

const selectedLanguage = computed({
  get: () => language.value,
  set: (code) => {
    if (!code || code === language.value) return;
    language.value = code;
    emit("language-change");
  },
});
</script>
