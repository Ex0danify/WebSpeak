<template>
  <div class="admin-root">
    <AdminShell v-model:login-username="loginUsername" v-model:login-password="loginPassword" v-model:new-password="newPassword" v-model:confirm-new-password="confirmNewPassword" :loading="loading" :screen="screen" :error-message="errorMessage" :submitting="submitting" :password-strength="passwordStrength" :current-page-title="currentPageTitle" :theme-icon="themeIcon" :theme-label="themeLabel" @login="login" @change-password="changePassword" @logout="logout" @cycle-theme="cycleTheme">
      <AdminServerPage v-if="route.path === '/admin/server'" />
      <AdminOperationsPage v-else-if="route.path === '/admin/operations'" />
      <AdminOverviewPage v-else />
    </AdminShell>
    <Toaster :label="t('notifications')" :dismiss-label="t('close')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { Toaster } from "@/shared/ui/toast";
import { storeToRefs } from "pinia";
import {
  AdminOperationsPage,
  AdminOverviewPage,
  AdminServerPage,
  AdminShell,
  useAdminSessionStore,
} from "@/features/admin";
import { useTheme } from "@/shared/composables/useTheme.js";
import { useI18n } from "@/shared/i18n/useI18n";

const route = useRoute();
const { t } = useI18n();
const { themeIcon, themeLabel, cycleTheme } = useTheme();
const session = useAdminSessionStore();
const { loading, screen, loginUsername, loginPassword, newPassword, confirmNewPassword, passwordStrength, errorMessage, submitting } = storeToRefs(session);
const { loadAdminView, login, changePassword, logout } = session;

const currentPageTitle = computed(() => route.path === "/admin/server" ? t('server') : route.path === "/admin/operations" ? t('operations') : t('overview'));

onMounted(loadAdminView);
</script>
<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; font-family: var(--font-sans); color: var(--ws-fg); background: var(--ws-surface-0); }
.admin-root { min-height: 100dvh; line-height: normal; }
label>span { display: block; margin-bottom: 7px; color: var(--ws-fg); font-size: 12px; font-weight: 700; }
label em { color: var(--ws-fg-muted); font-size: 10px; font-style: normal; font-weight: 500; }
label small { display: block; margin-top: 6px; color: var(--ws-fg-muted); font-size: 10px; line-height: 1.5; }
input { width: 100%; padding: 11px 12px; color: var(--ws-fg); background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 9px; font: inherit; font-size: 13px; outline: none; }
input { height: 43px; }
input:focus { border-color: var(--ws-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ws-accent) 13%, transparent); }
.page-content { width: min(1180px,calc(100% - 48px)); margin: 0 auto; padding: 40px 0 70px; }
@media (max-width: 850px) {
  .page-content { width: min(100% - 28px,700px); padding-top: 24px; }
}

/* Keep administration inside the browser viewport. Long data sets scroll in
   their own cards instead of pushing the whole page below the fold. */
.page-content{flex:1 1 auto;min-height:0;overflow-y:auto}
.operations-page{display:flex;flex-direction:column;width:min(1400px,calc(100% - 48px));height:calc(100dvh - 82px);overflow:hidden;padding-top:28px;padding-bottom:18px}

@media(max-width:850px){
  .operations-page{width:min(100% - 28px,700px);height:auto;min-height:calc(100dvh - 82px);overflow:visible}
}

/* Keep every admin surface inside the viewport. The page content and data
   lists are the scroll containers, never the document body. */
:global(html),:global(body),:global(#app){width:100%;height:100dvh;min-height:0;max-height:100dvh;overflow:hidden}
.admin-root{height:100dvh;min-height:0;overflow:hidden}


/* Keep static admin cards at their own height. Only long data collections
   become scroll surfaces, so a busy event feed cannot stretch its neighbour
   or turn the whole admin view into a second page. */
.page-content{display:flex;flex:1 1 auto;min-height:0;flex-direction:column;overflow:hidden}
.overview-page{padding:28px 0 18px}
.server-page{padding:28px 0 18px}
.operations-page{height:auto;min-height:0}

/* Theme all native scrollbars used by the admin surfaces. */
:global(*){scrollbar-color:var(--ws-line-strong) transparent;scrollbar-width:thin}
:global(*::-webkit-scrollbar){width:8px;height:8px}
:global(*::-webkit-scrollbar-track){background:transparent}
:global(*::-webkit-scrollbar-thumb){background:var(--ws-line-strong);background-clip:padding-box;border:2px solid transparent;border-radius:999px}
:global(*::-webkit-scrollbar-thumb:hover){background:var(--ws-fg-muted);background-clip:padding-box;border-width:1px}

@media(max-width:850px){
  .page-content{width:min(100% - 28px,700px);padding-top:20px;padding-bottom:14px}
  .operations-page{height:100%;overflow:hidden}
}

/* Server settings are a short form, not a set of independent data feeds.
   Let each card keep its natural height so a few extra pixels do not create
   three nested scrollbars. The section itself is the only fallback scroll
   surface when a small viewport cannot show the complete form. */
.server-page{overflow-x:hidden;overflow-y:auto}


/* Mobile admin pages should read like one continuous form. Keep the desktop
   viewport shell untouched, but let the document grow vertically on narrow
   screens instead of trapping content inside cards and nested panes. */
@media(max-width:850px){
  :global(html),:global(body),:global(#app){height:auto;min-height:100%;max-height:none;overflow:auto}
  .admin-root{height:auto;min-height:100dvh;overflow:visible}
  .page-content{display:block;height:auto;min-height:0;overflow:visible}

  .overview-page{height:auto;min-height:0;overflow:visible}

  .server-page{height:auto;min-height:0;overflow:visible}

  .operations-page{height:auto;min-height:0;overflow:visible}
}





/* Desktop server settings must keep their own scroll surface. The admin shell
   is viewport-locked, so an unconstrained flex item can otherwise push the
   relay card below the clipped page-content area. */

@media(min-width:851px){
  .server-page{flex:1 1 auto;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto}
}

/* The application is zoomed up on large displays so the 1920×1080 layout
   stays readable. Compensate viewport heights for that zoom; otherwise a
   2K viewport becomes a 1920px-tall admin shell and clips its lower cards. */
@media(min-width:851px){
  :global(html),:global(body){height:100dvh;max-height:100dvh}
  :global(#app),.admin-root{height:calc(100dvh / var(--ui-scale));min-height:calc(100dvh / var(--ui-scale));max-height:calc(100dvh / var(--ui-scale))}
}
</style>

