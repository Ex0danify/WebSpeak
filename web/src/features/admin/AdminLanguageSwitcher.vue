<template>
  <LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" @change="setLanguage(language)" />
</template>

<script setup lang="ts">
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const { language, t, setLanguage } = useI18n();
</script>
