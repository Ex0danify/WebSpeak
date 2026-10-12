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
      :aria-label="t('headerLinks')"
    >
      <div class="flex items-center gap-2 text-caption text-fg-muted max-compact:hidden">
        <span class="inline-block size-1.75 rounded-full bg-success ring-4 ring-success/14" aria-hidden="true"></span>
        {{ t("secureGateway") }}
      </div>
      <HeaderLinkButton v-for="link in leadingLinks" :key="link.key" v-bind="link.props" @click="link.onClick" />
      <Chip variant="accent" class="h-[30px] max-phone-lg:hidden" :title="versionLabel" :aria-label="versionLabel"
        >{{ VERSION_PREFIX }}{{ appVersion }}</Chip
      >
      <HeaderLinkButton v-for="link in trailingLinks" :key="link.key" v-bind="link.props" />
      <Tooltip :text="themeLabel">
        <Button variant="ghost" size="sm" icon-only class="max-phone-lg:hidden" :aria-label="themeLabel" @click="$emit('cycle-theme')">
          <Icon :name="themeIcon" />
        </Button>
      </Tooltip>
      <LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="$emit('language-change')" />
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { APP_NAME, BILIBILI_URL, BRAND_GLYPH, CHANGELOG_URL, GITHUB_URL, VERSION_PREFIX } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import HeaderLinkButton from "./HeaderLinkButton.vue";

const props = defineProps<{
  siteName: string;
  appVersion: string;
  themeIcon: "sun" | "moon";
  themeLabel: string;
}>();

const emit = defineEmits<{
  (e: "qq-open"): void;
  (e: "cycle-theme"): void;
  (e: "language-change"): void;
}>();

const { language, t } = useI18n();

type HeaderLink = {
  key: string;
  props: InstanceType<typeof HeaderLinkButton>["$props"];
  onClick?: () => void;
};

// Left of the version chip. QQ is a button that opens the dialog, the rest are links.
const leadingLinks = computed<HeaderLink[]>(() => [
  { key: "github", props: { label: t("githubRepository"), variant: "inverse", href: GITHUB_URL, icon: "github" } },
  { key: "qq", props: { label: t("qqGroup"), variant: "tinted", icon: "qq", popup: true }, onClick: () => emit("qq-open") },
  {
    key: "bilibili",
    props: { label: t("bilibiliProfile"), variant: "dangerSoft", href: BILIBILI_URL, glyph: BRAND_GLYPH, secondary: true },
  },
]);

// Right of the version chip. Secondary links: on a phone they sit in the footer, where text links are 44 px tall without crowding the bar.
const trailingLinks = computed<HeaderLink[]>(() => [
  {
    key: "changelog",
    props: { label: t("viewChangelog"), variant: "tinted", href: CHANGELOG_URL, icon: "clock", iconSize: "sm", secondary: true },
  },
  {
    key: "admin",
    props: { label: t("adminConsole"), variant: "tinted", href: "/admin", icon: "settings", iconSize: "sm", secondary: true },
  },
]);

const versionLabel = computed(() => `${t("currentVersion")}: v${props.appVersion}`);
</script>
