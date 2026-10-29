<template>
  <div v-if="loading" :class="centerCard">
    <Spinner size="lg" class="text-accent" />
    <p>{{ t("loading") }}</p>
  </div>
  <AdminChangePasswordScreen v-else-if="screen === 'change-password'" />
  <AdminLoginScreen v-else-if="screen === 'login'" />
  <div v-else :class="consoleFrame">
    <AdminSidebar />
    <div class="flex min-w-0 flex-col max-desktop:flex-auto">
      <AdminTopbar :theme-icon="themeIcon" :theme-label="themeLabel" @cycle-theme="cycleTheme" />
      <main class="flex-auto">
        <div v-if="errorMessage && !offline" :class="cn(adminContainer, 'pt-5')">
          <Banner variant="danger">{{ errorMessage }}</Banner>
        </div>
        <component :is="current.component" :key="`${current.path}-${recoveries}`" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { storeToRefs } from "pinia";
import { cn } from "@/shared/lib/cn";
import { Banner } from "@/shared/ui/banner";
import { Spinner } from "@/shared/ui/spinner";
import AdminChangePasswordScreen from "@/features/admin/shell/AdminChangePasswordScreen.vue";
import AdminLoginScreen from "@/features/admin/shell/AdminLoginScreen.vue";
import AdminSidebar from "@/features/admin/shell/AdminSidebar.vue";
import AdminTopbar from "@/features/admin/shell/AdminTopbar.vue";
import { centerCard, consoleFrame } from "@/features/admin/shell/adminChrome";
import { useAdminGatewayStore } from "@/features/admin/core/adminGateway";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { adminContainer } from "@/features/admin/ui/adminPage";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { useAdminRoute } from "@/features/admin/shell/useAdminRoute";
import { useTheme } from "@/shared/composables/useTheme.js";
import { useI18n } from "@/shared/i18n/useI18n";

const { loading, screen } = storeToRefs(useAdminSessionStore());
const { errorMessage } = storeToRefs(useAdminFeedbackStore());
const gateway = useAdminGatewayStore();
const { offline, recoveries } = storeToRefs(gateway);
// Only a signed-in console watches the gateway, the sign-in screens have nothing to show it with.
watch(screen, (value) => (value === "admin" ? gateway.start() : gateway.stop()), { immediate: true });
onBeforeUnmount(gateway.stop);
const { current } = useAdminRoute();
const { themeIcon, themeLabel, cycleTheme } = useTheme();
const { t } = useI18n();
</script>
