import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { createAdminApi, type ApiError } from "./adminApi.js";
import { createAdminFormat } from "./adminFormat.js";
import { toast } from "@/shared/composables/useToast";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useAdminOperationsStore } from "./adminOperations.js";
import { useAdminOverviewStore } from "./adminOverview.js";
import { useAdminServerSettingsStore } from "./adminServerSettings.js";

export type AdminScreen = "login" | "change-password" | "admin";

/** Sign-in state of the admin console: which screen is showing, the login/change-password forms
 *  and the CSRF token. Also owns the state every admin page shares (the error banner, the
 *  in-flight write flag, success toasts) and the fetch helpers (`getJson`/`sendJson`), since they
 *  need the token and react to a 401 by dropping back to the login screen. */
export const useAdminSessionStore = defineStore("adminSession", () => {
  const route = useRoute();
  const router = useRouter();
  const { language, t } = useI18n();
  const { errorText } = createAdminFormat(language, t);

  const loading = ref(true);
  const screen = ref<AdminScreen>("login");
  const csrfToken = ref("");
  const loginUsername = ref("admin");
  const loginPassword = ref("");
  const newPassword = ref("");
  const confirmNewPassword = ref("");
  /** Failures anywhere in the console surface in the same banner. */
  const errorMessage = ref("");
  /** One login/save/invite write in flight at a time. */
  const submitting = ref(false);

  /** Every successful action of the console says so in a toast; a failure stays a banner (errorMessage). */
  function notify(message: string) { toast({ title: message, variant: "success" }); }

  const { getJson, sendJson } = createAdminApi({
    getCsrfToken: () => csrfToken.value,
    onUnauthorized: () => {
      if (screen.value === "admin") {
        screen.value = "login";
        void router.replace("/admin/login");
      }
    },
  });

  /** What the console shows once signed in. The operations page loads itself when it is entered. */
  async function loadAdminData() {
    await Promise.all([useAdminOverviewStore().loadOverview(), useAdminServerSettingsStore().loadServerSettings()]);
  }

  const passwordStrength = computed(() => Math.min(100, Math.max(8, newPassword.value.length * 5 + (/[\s\W]/.test(newPassword.value) ? 15 : 0))));

  async function loadAdminView() {
    loading.value = true;
    try {
      const session = await getJson("/api/admin/session");
      if (!session.authenticated) {
        screen.value = "login";
        if (route.path !== "/admin/login") await router.replace("/admin/login");
      } else if (session.mustChangePassword) {
        csrfToken.value = String(session.csrfToken || "");
        screen.value = "change-password";
        if (route.path !== "/admin/change-password") await router.replace("/admin/change-password");
      } else {
        csrfToken.value = String(session.csrfToken || "");
        screen.value = "admin";
        if (route.path === "/admin/login" || route.path === "/admin/change-password") await router.replace("/admin");
        await loadAdminData();
      }
    } catch {
      errorMessage.value = t("requestFailed");
    } finally {
      loading.value = false;
    }
  }

  async function login() {
    submitting.value = true;
    errorMessage.value = "";
    try {
      const result = await sendJson("/api/admin/login", "POST", { username: loginUsername.value.trim(), password: loginPassword.value }, false);
      csrfToken.value = String(result.csrfToken || "");
      loginPassword.value = "";
      if (result.mustChangePassword) {
        screen.value = "change-password";
        await router.replace("/admin/change-password");
      } else {
        screen.value = "admin";
        await router.replace("/admin");
        await loadAdminData();
      }
    } catch (error) {
      errorMessage.value = errorText((error as ApiError).code);
    } finally {
      submitting.value = false;
    }
  }

  async function changePassword() {
    errorMessage.value = "";
    if (newPassword.value.length < 12) { errorMessage.value = t("setupPasswordShort"); return; }
    if (newPassword.value !== confirmNewPassword.value) { errorMessage.value = t("setupPasswordsMismatch"); return; }
    submitting.value = true;
    try {
      await sendJson("/api/admin/change-password", "POST", { newPassword: newPassword.value });
      newPassword.value = "";
      confirmNewPassword.value = "";
      screen.value = "admin";
      await router.replace("/admin");
      await loadAdminData();
    } catch (error) {
      errorMessage.value = errorText((error as ApiError).code);
    } finally {
      submitting.value = false;
    }
  }

  async function logout() {
    try {
      await sendJson("/api/admin/logout", "POST", {});
    } finally {
      csrfToken.value = "";
      screen.value = "login";
      // Nothing of the signed-out console stays in memory. Setup stores have no `$reset`.
      useAdminOverviewStore().reset();
      useAdminOperationsStore().reset();
      useAdminServerSettingsStore().reset();
      await router.replace("/admin/login");
    }
  }

  return { loading, screen, csrfToken, loginUsername, loginPassword, newPassword, confirmNewPassword, errorMessage, submitting, passwordStrength, getJson, sendJson, errorText, notify, loadAdminView, login, changePassword, logout };
});
