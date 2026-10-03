<template>
  <div v-if="loading" class="center-card compact"><span class="spinner"></span><p>{{ t('loading') }}</p></div>

  <main v-else-if="screen === 'change-password'" class="login-page">
    <section class="login-card">
      <div class="admin-brand centered"><span><Icon name="waveform" :size="24" /></span><div><strong>WebSpeak</strong><small>{{ t('adminConsoleTitle') }}</small></div></div>
      <header><h1>{{ t('changePasswordTitle') }}</h1><p>{{ t('changePasswordLead') }}</p></header>
      <form @submit.prevent="$emit('change-password')">
        <Banner v-if="errorMessage" variant="danger" class="text-left">{{ errorMessage }}</Banner>
        <Field :label="t('newPassword')" class="text-left"><Input v-model="newPassword" type="password" autocomplete="new-password" maxlength="1024" autofocus :placeholder="t('passwordPlaceholder')" /></Field>
        <Field :label="t('confirmPassword')" class="text-left"><Input v-model="confirmNewPassword" type="password" autocomplete="new-password" maxlength="1024" /></Field>
        <div class="strength"><i :style="{ width: `${passwordStrength}%` }"></i></div>
        <Button type="submit" class="w-full" :loading="submitting">{{ t('savePassword') }}</Button>
      </form>
      <p class="security-note">{{ t('defaultCredentialNotice') }}</p><LanguageSwitcher v-model="language" class="language-link" :menu-label="t('languageMenu')" @change="persistLanguage" />
    </section>
  </main>

  <main v-else-if="screen === 'login'" class="login-page">
    <section class="login-card">
      <div class="admin-brand centered"><span><Icon name="waveform" :size="24" /></span><div><strong>WebSpeak</strong><small>{{ t('adminConsoleTitle') }}</small></div></div>
      <header><h1>{{ t('welcomeAdmin') }}</h1><p>{{ t('loginLead') }}</p></header>
      <form @submit.prevent="$emit('login')">
        <Banner v-if="errorMessage" variant="danger" class="text-left">{{ errorMessage }}</Banner>
        <Field :label="t('adminUsername')" class="text-left"><Input v-model="loginUsername" autocomplete="username" autofocus /></Field>
        <Field :label="t('adminPassword')" class="text-left"><Input v-model="loginPassword" type="password" autocomplete="current-password" /></Field>
        <Button type="submit" class="w-full" :loading="submitting">{{ t('login') }}</Button>
      </form>
      <div class="login-actions"><RouterLink to="/" class="home-link"><Icon name="home" :size="15" />{{ t('backHome') }}</RouterLink><LanguageSwitcher v-model="language" class="language-link" :menu-label="t('languageMenu')" @change="persistLanguage" /></div>
    </section>
  </main>

  <div v-else class="admin-shell">
    <aside class="admin-sidebar">
      <div class="admin-brand"><span><Icon name="waveform" :size="22" /></span><div><strong>WebSpeak</strong><small>{{ t('adminConsoleTitle') }}</small></div></div>
      <nav><RouterLink to="/admin" exact-active-class="active"><Icon name="activity" :size="18" />{{ t('overview') }}</RouterLink><RouterLink to="/admin/server" active-class="active"><Icon name="server" :size="18" />{{ t('server') }}</RouterLink><RouterLink to="/admin/operations" active-class="active"><Icon name="users" :size="18" />{{ t('operations') }}</RouterLink></nav>
      <div class="sidebar-bottom">
        <Button as="a" variant="ghost" :class="sidebarActionClass + ' max-[850px]:hidden'" href="/" target="_blank"><Icon name="share" :size="16" />{{ t('openGuest') }}</Button>
        <Button variant="ghost" :class="sidebarActionClass" :aria-label="t('logout')" @click="$emit('logout')"><Icon name="door" :size="16" /><span class="max-[850px]:sr-only">{{ t('logout') }}</span></Button>
      </div>
    </aside>

    <main class="admin-main">
      <header class="admin-topbar"><div><small>{{ t('adminConsoleTitle') }}</small><h1>{{ currentPageTitle }}</h1></div><div><Chip variant="success" dot><span class="max-[520px]:sr-only">{{ t('gatewayRunning') }}</span></Chip><Button variant="outline" size="sm" class="gap-1.5 border-line bg-accent-soft text-[11px] font-bold text-accent hover:bg-accent-soft" :title="themeLabel" :aria-label="themeLabel" @click="$emit('cycle-theme')"><Icon :name="themeIcon" :size="17" /><span class="max-[520px]:hidden">{{ themeLabel }}</span></Button><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" @change="persistLanguage" /></div></header>

      <Banner v-if="errorMessage" variant="danger" class="page-alert w-auto">{{ errorMessage }}</Banner>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
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
const sidebarActionClass = "h-auto justify-start gap-2.5 rounded-[9px] px-3 py-[11px] text-xs font-bold text-fg-muted";

function persistLanguage() { setLanguage(language.value); }
</script>

<style scoped>
.admin-brand { display: flex; align-items: center; gap: 12px; }
.admin-brand>span { display: grid; place-items: center; width: 42px; height: 42px; color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 12px; box-shadow: var(--shadow-sm); }
.admin-brand strong, .admin-brand small { display: block; }
.admin-brand strong { font-size: 20px; letter-spacing: -.04em; }
.admin-brand small { margin-top: 3px; color: var(--ws-fg-muted); font-size: 11px; }
.language-link { color: var(--ws-accent); background: var(--ws-accent-soft); border: 1px solid var(--ws-line); border-radius: 8px; padding: 8px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
.login-card { width: min(560px,100%); padding: 36px; background: var(--ws-surface-1); border: 1px solid var(--ws-line); border-radius: 20px; box-shadow: 0 20px 55px color-mix(in srgb, var(--ws-accent) 9%, transparent); }
.login-card h1 { margin: 10px 0 7px; font-size: 29px; font-weight: 700; letter-spacing: -.045em; }
.login-card header p { margin: 0; color: var(--ws-fg-muted); font-size: 13px; line-height: 1.6; }
.login-card form { display: grid; gap: 17px; margin-top: 27px; }
.strength { height: 4px; overflow: hidden; background: var(--ws-surface-2); border-radius: 4px; }
.strength i { display: block; height: 100%; background: linear-gradient(90deg,var(--ws-warning),var(--ws-accent)); transition: .2s; }
.spinner { display: inline-block; width: 22px; height: 22px; border: 2px solid var(--ws-line); border-top-color: color-mix(in srgb, var(--ws-accent) 85%, var(--ws-fg)); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin {
  to { transform: rotate(360deg); }
}
.login-page { display: grid; min-height: 100dvh; place-items: center; padding: 25px; background: radial-gradient(circle at 50% 10%,color-mix(in srgb, var(--ws-accent) 20%, transparent),transparent 30rem),var(--ws-surface-0); }
.login-card { max-width: 430px; text-align: center; }
.admin-brand.centered { justify-content: center; }
.login-card header { margin: 30px 0 24px; }
.language-link { margin-top: 20px; }
.center-card { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; color: var(--ws-fg-muted); }
.admin-shell { display: grid; min-height: 100dvh; grid-template-columns: 236px minmax(0,1fr); }
.admin-sidebar { position: sticky; top: 0; display: flex; height: 100dvh; flex-direction: column; padding: 26px 18px; background: var(--ws-surface-1); color: var(--ws-fg); border-right: 1px solid var(--ws-line); }
.admin-sidebar .admin-brand { padding: 0 8px 28px; }
.admin-sidebar nav { display: grid; gap: 6px; }
.admin-sidebar nav a { display: flex; align-items: center; gap: 10px; padding: 11px 12px; color: var(--ws-fg-muted); text-decoration: none; background: transparent; border: 0; border-radius: 9px; font-size: 12px; font-weight: 700; cursor: pointer; }
.admin-sidebar nav a.active { color: var(--ws-accent); background: var(--ws-accent-soft); }
.sidebar-bottom { display: grid; gap: 4px; margin-top: auto; padding-top: 20px; border-top: 1px solid var(--ws-line); }
.admin-main { min-width: 0; }
.admin-topbar { display: flex; align-items: center; justify-content: space-between; min-height: 82px; padding: 0 clamp(24px,4vw,58px); background: var(--ws-surface-1); border-bottom: 1px solid var(--ws-line); }
.admin-topbar small, .admin-topbar h1 { display: block; margin: 0; }
.admin-topbar small { color: var(--ws-fg-muted); font-size: 10px; text-transform: uppercase; }
.admin-topbar h1 { margin-top: 4px; font-size: 21px; font-weight: 700; }
.admin-topbar>div:last-child { display: flex; align-items: center; gap: 8px; color: var(--ws-fg-muted); font-size: 11px; }
.page-alert { margin: 20px 24px 0; }
@media (max-width: 850px) {
  .admin-shell { display: block; }
  .admin-sidebar { position: static; width: 100%; height: auto; flex-direction: row; align-items: center; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--ws-line); }
  .admin-sidebar .admin-brand { padding: 0; }
  .admin-sidebar .admin-brand small { display: none; }
  .admin-sidebar nav { display: flex; margin-left: auto; }
  .admin-sidebar nav a { font-size: 0; }
  .admin-sidebar nav a .ui-icon { width: 20px; height: 20px; }
  .sidebar-bottom { display: flex; margin: 0 0 0 8px; padding: 0; border: 0; }
  .admin-topbar { padding: 0 18px; }
}
@media (max-width: 520px) {
  .login-card { padding: 25px 20px; border-radius: 15px; }
  .admin-topbar>div:last-child { font-size: 0; }
}
.security-note{margin:18px 0 0;color:var(--ws-fg-muted);font-size:11px;line-height:1.5}

/* Keep administration inside the browser viewport. Long data sets scroll in
   their own cards instead of pushing the whole page below the fold. */
.admin-shell{height:100dvh;min-height:100dvh;overflow:hidden}
.admin-main{min-height:0;display:flex;flex-direction:column;overflow:hidden}
.admin-topbar{flex:0 0 auto}

@media(max-width:850px){
  .admin-main{height:100%}
}

.login-page{height:100dvh;min-height:0;overflow:hidden}
.login-card{max-height:calc(100dvh - 50px);overflow-y:auto}

@media(max-width:850px){
  .admin-shell{display:flex;flex-direction:column}
  .admin-main{height:auto;flex:1 1 auto}
}

.admin-main>.page-alert{flex:0 0 auto}

@media(max-width:850px){
  .admin-shell{height:auto;min-height:100dvh;overflow:visible}
  .admin-main{height:auto;min-height:0;overflow:visible}
  .login-page{height:auto;min-height:100dvh;overflow:visible}
  .login-card{max-height:none;overflow:visible}
}

.login-actions{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:20px;flex-wrap:wrap}
.login-actions .language-link{margin-top:0}
.home-link{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;color:var(--ws-accent);background:var(--ws-accent-soft);border:1px solid var(--ws-line);border-radius:8px;font-size:11px;font-weight:700;text-decoration:none}
.home-link:hover{background:var(--ws-accent-soft)}
.language-link{margin-top:20px!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important}
.login-actions .language-link{margin-top:0!important}

/* The application is zoomed up on large displays so the 1920×1080 layout
   stays readable. Compensate viewport heights for that zoom; otherwise a
   2K viewport becomes a 1920px-tall admin shell and clips its lower cards. */
@media(min-width:851px){
  .admin-shell,.admin-sidebar{height:calc(100dvh / var(--ui-scale));min-height:calc(100dvh / var(--ui-scale));max-height:calc(100dvh / var(--ui-scale))}
  .admin-main{height:100%;min-height:0}
}
</style>
