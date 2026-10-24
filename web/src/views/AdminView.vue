<template>
  <div
    class="admin-root h-dvh min-h-0 overflow-hidden leading-[normal] max-desktop:h-auto max-desktop:min-h-dvh max-desktop:overflow-visible desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))] desktop:min-h-[calc(100dvh/var(--ui-scale))]"
  >
    <AdminShell
      v-model:login-username="loginUsername"
      v-model:login-password="loginPassword"
      v-model:new-password="newPassword"
      v-model:confirm-new-password="confirmNewPassword"
      :loading="loading"
      :screen="screen"
      :error-message="errorMessage"
      :submitting="submitting"
      :password-strength="passwordStrength"
      :current-page-title="currentPageTitle"
      :theme-icon="themeIcon"
      :theme-label="themeLabel"
      @login="login"
      @change-password="changePassword"
      @logout="logout"
      @cycle-theme="cycleTheme"
    >
      <AdminServerPage v-if="route.path === '/admin/server'" />
      <AdminOperationsPage v-else-if="route.path === '/admin/operations'" />
      <AdminOverviewPage v-else />
    </AdminShell>
    <Toaster :label="t('notifications')" :dismiss-label="t('close')" />
    <DialogHost :close-label="t('close')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { Toaster } from "@/shared/ui/toast";
import { DialogHost } from "@/shared/ui/dialog";
import { storeToRefs } from "pinia";
import {
  AdminOperationsPage,
  AdminOverviewPage,
  AdminServerPage,
  AdminShell,
  registerAdminStores,
  useAdminFeedbackStore,
  useAdminSessionStore,
} from "@/features/admin";
import { useTheme } from "@/shared/composables/useTheme.js";
import { useI18n } from "@/shared/i18n/useI18n";

const route = useRoute();
const { t } = useI18n();
const { themeIcon, themeLabel, cycleTheme } = useTheme();
registerAdminStores();
const session = useAdminSessionStore();
const { loading, screen, loginUsername, loginPassword, newPassword, confirmNewPassword, passwordStrength, signingIn, changingPassword } =
  storeToRefs(session);
const { errorMessage } = storeToRefs(useAdminFeedbackStore());
const submitting = computed(() => signingIn.value || changingPassword.value);
const { loadAdminView, login, changePassword, logout } = session;

const currentPageTitle = computed(() =>
  route.path === "/admin/server" ? t("server") : route.path === "/admin/operations" ? t("operations") : t("overview"),
);

onMounted(loadAdminView);
</script>
