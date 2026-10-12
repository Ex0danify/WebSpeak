<template>
  <div v-if="loading" :class="centerCard">
    <Spinner size="lg" class="text-accent" />
    <p>{{ t("loading") }}</p>
  </div>

  <main v-else-if="screen === 'change-password'" :class="loginPage">
    <Card as="section" padding="xl" raised :class="loginCard">
      <div :class="[brandRow, 'justify-center']">
        <span :class="brandMark"><Icon name="waveform" :size="24" /></span>
        <div>
          <strong :class="brandName">{{ APP_NAME }}</strong
          ><small :class="brandSub">{{ t("adminConsoleTitle") }}</small>
        </div>
      </div>
      <header class="mt-7.5 mb-6">
        <h1 class="mt-2.5 mb-1.75 text-3xl font-bold tracking-brand">{{ t("changePasswordTitle") }}</h1>
        <p class="text-ui leading-relaxed text-fg-muted">{{ t("changePasswordLead") }}</p>
      </header>
      <form class="mt-6.75 grid gap-4.25" @submit.prevent="$emit('change-password')">
        <Banner v-if="errorMessage" variant="danger" class="text-left">{{ errorMessage }}</Banner>
        <Field :label="t('newPassword')" class="text-left"
          ><Input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            maxlength="1024"
            autofocus
            :placeholder="t('passwordPlaceholder')"
        /></Field>
        <Field :label="t('confirmPassword')" class="text-left"
          ><Input v-model="confirmNewPassword" type="password" autocomplete="new-password" maxlength="1024"
        /></Field>
        <div class="h-1 overflow-hidden rounded-sm bg-surface-2">
          <i
            class="block h-full bg-linear-to-r from-warning to-accent transition-all duration-200"
            :style="{ width: `${passwordStrength}%` }"
          ></i>
        </div>
        <Button type="submit" class="w-full" :loading="submitting">{{ t("savePassword") }}</Button>
      </form>
      <p class="mt-4.5 text-caption leading-normal text-fg-muted">{{ t("defaultCredentialNotice") }}</p>
      <LanguageSwitcher v-model="language" class="mt-5" :menu-label="t('languageMenu')" @change="persistLanguage" />
    </Card>
  </main>

  <main v-else-if="screen === 'login'" :class="loginPage">
    <Card as="section" padding="xl" raised :class="loginCard">
      <div :class="[brandRow, 'justify-center']">
        <span :class="brandMark"><Icon name="waveform" :size="24" /></span>
        <div>
          <strong :class="brandName">{{ APP_NAME }}</strong
          ><small :class="brandSub">{{ t("adminConsoleTitle") }}</small>
        </div>
      </div>
      <header class="mt-7.5 mb-6">
        <h1 class="mt-2.5 mb-1.75 text-3xl font-bold tracking-brand">{{ t("welcomeAdmin") }}</h1>
        <p class="text-ui leading-relaxed text-fg-muted">{{ t("loginLead") }}</p>
      </header>
      <form class="mt-6.75 grid gap-4.25" @submit.prevent="$emit('login')">
        <Banner v-if="errorMessage" variant="danger" class="text-left">{{ errorMessage }}</Banner>
        <Field :label="t('adminUsername')" class="text-left"><Input v-model="loginUsername" autocomplete="username" autofocus /></Field>
        <Field :label="t('adminPassword')" class="text-left"
          ><Input v-model="loginPassword" type="password" autocomplete="current-password"
        /></Field>
        <Button type="submit" class="w-full" :loading="submitting">{{ t("login") }}</Button>
      </form>
      <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
        <RouterLink
          to="/"
          class="inline-flex items-center gap-1.5 rounded-md border border-line bg-accent-soft px-3 py-2 text-caption font-bold text-accent no-underline"
          ><Icon name="home" :size="15" />{{ t("backHome") }}</RouterLink
        ><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" @change="persistLanguage" />
      </div>
    </Card>
  </main>

  <div v-else :class="shell">
    <aside :class="sidebar">
      <div :class="[brandRow, 'px-2 pb-7 max-desktop:p-0']">
        <span :class="brandMark"><Icon name="waveform" :size="22" /></span>
        <div>
          <strong :class="brandName">{{ APP_NAME }}</strong
          ><small :class="[brandSub, 'max-desktop:hidden']">{{ t("adminConsoleTitle") }}</small>
        </div>
      </div>
      <nav class="grid gap-1.5 max-desktop:ml-auto max-desktop:flex">
        <RouterLink to="/admin" :class="navLink"
          ><Icon name="activity" :size="18" /><span class="max-desktop:sr-only">{{ t("overview") }}</span></RouterLink
        >
        <RouterLink to="/admin/server" :class="navLink"
          ><Icon name="server" :size="18" /><span class="max-desktop:sr-only">{{ t("server") }}</span></RouterLink
        >
        <RouterLink to="/admin/operations" :class="navLink"
          ><Icon name="users" :size="18" /><span class="max-desktop:sr-only">{{ t("operations") }}</span></RouterLink
        >
      </nav>
      <div
        class="mt-auto grid gap-1 border-t border-line pt-5 max-desktop:mt-0 max-desktop:ml-2 max-desktop:flex max-desktop:border-t-0 max-desktop:p-0"
      >
        <Button as="a" variant="ghost" :class="sidebarActionClass + ' max-desktop:hidden'" href="/" target="_blank"
          ><Icon name="share" :size="16" />{{ t("openGuest") }}</Button
        >
        <Button variant="ghost" :class="sidebarActionClass" :aria-label="t('logout')" @click="$emit('logout')"
          ><Icon name="door" :size="16" /><span class="max-desktop:sr-only">{{ t("logout") }}</span></Button
        >
      </div>
    </aside>

    <main class="flex min-h-0 min-w-0 flex-col overflow-hidden max-desktop:flex-auto max-desktop:overflow-visible desktop:h-full">
      <header
        class="flex min-h-20.5 flex-none items-center justify-between border-b border-line bg-surface-1 px-[clamp(24px,4vw,58px)] max-desktop:px-4.5"
      >
        <div>
          <small class="block text-2xs text-fg-muted uppercase">{{ t("adminConsoleTitle") }}</small>
          <h1 class="mt-1 block text-xl font-bold">{{ currentPageTitle }}</h1>
        </div>
        <div class="flex items-center gap-2 text-caption text-fg-muted">
          <Chip variant="success" dot
            ><span class="max-narrow:sr-only">{{ t("gatewayRunning") }}</span></Chip
          ><Button variant="accentSoft" size="sm" class="gap-1.5" :title="themeLabel" :aria-label="themeLabel" @click="$emit('cycle-theme')"
            ><Icon :name="themeIcon" :size="17" /><span class="max-narrow:hidden">{{ themeLabel }}</span></Button
          ><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" @change="persistLanguage" />
        </div>
      </header>

      <Banner v-if="errorMessage" variant="danger" class="mx-6 mt-5 w-auto flex-none">{{ errorMessage }}</Banner>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { APP_NAME } from "@/shared/lib/brand";
import { RouterLink } from "vue-router";
import { Banner } from "@/shared/ui/banner";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n";

defineProps<{
  loading: boolean;
  screen: string;
  errorMessage: string;
  submitting: boolean;
  passwordStrength: number;
  currentPageTitle: string;
  themeIcon: "sun" | "moon";
  themeLabel: string;
}>();

const loginUsername = defineModel<string>("loginUsername", { required: true });
const loginPassword = defineModel<string>("loginPassword", { required: true });
const newPassword = defineModel<string>("newPassword", { required: true });
const confirmNewPassword = defineModel<string>("confirmNewPassword", { required: true });

defineEmits<{
  (e: "login"): void;
  (e: "change-password"): void;
  (e: "logout"): void;
  (e: "cycle-theme"): void;
}>();

const { language, t, setLanguage } = useI18n();
// Look of the sidebar footer actions (Open guest page, Log out): quiet, full width, left aligned.
const sidebarActionClass = "h-auto justify-start gap-2.5 rounded-md px-3 py-2.75 text-xs font-bold text-fg-muted";
// Layout of the three screens. The shell and the sidebar are sized against --ui-scale on desktop
// (the app is zoomed up on large displays, so viewport heights are divided by the zoom).
const scaledHeight =
  "desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))] desktop:min-h-[calc(100dvh/var(--ui-scale))]";
const centerCard = "absolute inset-0 grid place-content-center justify-items-center text-fg-muted";
const loginPage =
  "grid h-dvh min-h-0 place-items-center overflow-hidden bg-surface-0 bg-[radial-gradient(circle_at_50%_10%,color-mix(in_srgb,var(--color-accent)_20%,transparent),transparent_30rem)] p-6.25 max-desktop:h-auto max-desktop:min-h-dvh max-desktop:overflow-visible";
const loginCard =
  "max-h-[calc(100dvh-50px)] w-full max-w-107.5 overflow-y-auto text-center max-desktop:max-h-none max-desktop:overflow-visible";
const brandRow = "flex items-center gap-3";
const brandMark = "grid size-10.5 place-items-center rounded-lg bg-accent text-accent-fg shadow-sm";
const brandName = "block text-xl tracking-brand";
const brandSub = "mt-0.75 block text-caption text-fg-muted";
const shell = `grid h-dvh min-h-dvh grid-cols-[236px_minmax(0,1fr)] overflow-hidden ${scaledHeight} max-desktop:flex max-desktop:h-auto max-desktop:flex-col max-desktop:overflow-visible`;
const sidebar = `sticky top-0 flex h-dvh flex-col border-r border-line bg-surface-1 px-4.5 py-6.5 text-fg ${scaledHeight} max-desktop:static max-desktop:h-auto max-desktop:w-full max-desktop:flex-row max-desktop:items-center max-desktop:border-r-0 max-desktop:border-b max-desktop:px-4 max-desktop:py-3`;
// The router marks the current page with aria-current="page".
const navLink =
  "flex items-center gap-2.5 rounded-md px-3 py-2.75 text-xs font-bold text-fg-muted no-underline aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent max-desktop:[&_.ui-icon]:size-5";

function persistLanguage() {
  setLanguage(language.value);
}
</script>
