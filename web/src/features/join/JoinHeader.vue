<template>
  <header role="banner">
    <div
      class="flex items-center gap-3 max-phone-lg:min-w-0 max-phone-lg:flex-auto max-phone-lg:gap-1.75 max-phone-xs:w-8 max-phone-xs:flex-none"
    >
      <img
        class="block size-10 rounded-lg bg-accent object-cover shadow-sm max-phone-lg:size-8 max-phone-lg:rounded-md"
        src="/site-icon.jpg"
        :alt="APP_NAME"
      />
      <div class="max-phone-xs:hidden">
        <strong class="block text-xl tracking-brand text-accent max-phone-lg:truncate max-phone-lg:text-ui">{{ siteName }}</strong>
        <small class="mt-0.5 block text-caption tracking-label text-fg-muted uppercase max-phone-lg:hidden">{{
          t("browserWorkspace")
        }}</small>
      </div>
    </div>
    <nav
      class="flex items-center gap-4.25 max-compact:gap-1.75 max-phone-lg:min-w-0 max-phone-lg:flex-none max-phone-lg:gap-0.5"
      :aria-label="t('headerNav')"
    >
      <Tooltip :text="themeLabel">
        <Button variant="ghost" size="sm" icon-only class="max-phone-lg:hidden" :aria-label="themeLabel" @click="$emit('cycle-theme')">
          <Icon :name="themeIcon" />
        </Button>
      </Tooltip>
      <LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="$emit('language-change')" />
      <Menu align="end" :label="t('about')" :close-label="t('close')">
        <template #trigger>
          <Button variant="accentSoft" size="sm" class="max-compact:min-h-11 max-compact:min-w-11" :aria-label="t('about')">
            <Icon name="info" :size="16" />
            <span class="max-compact:hidden">{{ t("about") }}</span>
          </Button>
        </template>
        <MenuLabel plain>{{ APP_NAME }} {{ versionLabel }}</MenuLabel>
        <MenuItem v-for="item in items" :key="item.key" @select="openLink(item.href)">
          <Icon :name="item.icon" :size="16" />
          {{ item.label }}
        </MenuItem>
      </Menu>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { APP_NAME, CHANGELOG_URL, GITHUB_URL, VERSION_PREFIX } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Icon, type IconName } from "@/shared/ui/icon";
import { Menu, MenuItem, MenuLabel } from "@/shared/ui/menu";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n.js";

const props = defineProps<{
  siteName: string;
  appVersion: string;
  themeIcon: "sun" | "moon";
  themeLabel: string;
}>();

defineEmits<{
  (e: "cycle-theme"): void;
  (e: "language-change"): void;
}>();

const { language, t } = useI18n();

const versionLabel = computed(() => `${VERSION_PREFIX}${props.appVersion}`);

const items = computed<{ key: string; label: string; icon: IconName; href: string }[]>(() => [
  { key: "github", label: t("githubRepository"), icon: "github", href: GITHUB_URL },
  { key: "changelog", label: t("viewChangelog"), icon: "clock", href: CHANGELOG_URL },
  { key: "admin", label: t("adminConsole"), icon: "settings", href: "/admin" },
]);

function openLink(href: string) {
  if (href.startsWith("http")) window.open(href, "_blank", "noopener,noreferrer");
  else window.location.assign(href);
}
</script>
