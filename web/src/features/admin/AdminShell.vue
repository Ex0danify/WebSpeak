<template>
  <div v-if="loading" :class="centerCard">
    <Spinner size="lg" class="text-accent" />
    <p>{{ t("loading") }}</p>
  </div>
  <AdminChangePasswordScreen v-else-if="screen === 'change-password'" />
  <AdminLoginScreen v-else-if="screen === 'login'" />
  <div v-else :class="consoleFrame">
    <AdminSidebar />
    <main class="flex min-h-0 min-w-0 flex-col overflow-hidden max-desktop:flex-auto max-desktop:overflow-visible desktop:h-full">
      <AdminHeader :title="adminRouteTitle(current, t)" :theme-icon="themeIcon" :theme-label="themeLabel" @cycle-theme="cycleTheme" />
      <Banner v-if="errorMessage" variant="danger" class="mx-6 mt-5 w-auto flex-none">{{ errorMessage }}</Banner>
      <component :is="current.component" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Spinner } from "@/shared/ui/spinner";
import AdminChangePasswordScreen from "@/features/admin/AdminChangePasswordScreen.vue";
import AdminHeader from "@/features/admin/AdminHeader.vue";
import AdminLoginScreen from "@/features/admin/AdminLoginScreen.vue";
import AdminSidebar from "@/features/admin/AdminSidebar.vue";
import { centerCard, consoleFrame } from "@/features/admin/adminChrome";
import { useAdminFeedbackStore } from "@/features/admin/adminFeedback";
import { adminRouteTitle } from "@/features/admin/adminRoutes";
import { useAdminSessionStore } from "@/features/admin/adminSession";
import { useAdminRoute } from "@/features/admin/useAdminRoute";
import { useTheme } from "@/shared/composables/useTheme.js";
import { useI18n } from "@/shared/i18n/useI18n";

const { loading, screen } = storeToRefs(useAdminSessionStore());
const { errorMessage } = storeToRefs(useAdminFeedbackStore());
const { current } = useAdminRoute();
const { themeIcon, themeLabel, cycleTheme } = useTheme();
const { t } = useI18n();
</script>
