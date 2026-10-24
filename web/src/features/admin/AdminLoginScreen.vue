<template>
  <main :class="authPage">
    <Card as="section" padding="xl" raised :class="authCard">
      <AdminBrand />
      <header class="mt-7.5 mb-6">
        <h1 class="mt-2.5 mb-1.75 text-3xl font-bold tracking-brand">{{ t("welcomeAdmin") }}</h1>
        <p class="text-ui leading-relaxed text-fg-muted">{{ t("loginLead") }}</p>
      </header>
      <form class="mt-6.75 grid gap-4.25" @submit.prevent="login()">
        <Banner v-if="errorMessage" variant="danger" class="text-left">{{ errorMessage }}</Banner>
        <Field :label="t('adminUsername')" class="text-left"><Input v-model="loginUsername" autocomplete="username" autofocus /></Field>
        <Field :label="t('adminPassword')" class="text-left"
          ><Input v-model="loginPassword" type="password" autocomplete="current-password"
        /></Field>
        <Button type="submit" class="w-full" :loading="signingIn">{{ t("login") }}</Button>
      </form>
      <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
        <RouterLink
          to="/"
          class="inline-flex items-center gap-1.5 rounded-md border border-line bg-accent-soft px-3 py-2 text-caption font-bold text-accent no-underline"
          ><Icon name="home" :size="15" />{{ t("backHome") }}</RouterLink
        ><AdminLanguageSwitcher />
      </div>
    </Card>
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { RouterLink } from "vue-router";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import AdminBrand from "@/features/admin/AdminBrand.vue";
import AdminLanguageSwitcher from "@/features/admin/AdminLanguageSwitcher.vue";
import { authCard, authPage } from "@/features/admin/adminChrome";
import { useAdminFeedbackStore } from "@/features/admin/adminFeedback";
import { useAdminSessionStore } from "@/features/admin/adminSession";
import { useI18n } from "@/shared/i18n/useI18n";

const session = useAdminSessionStore();
const { loginUsername, loginPassword, signingIn } = storeToRefs(session);
const { login } = session;
const { errorMessage } = storeToRefs(useAdminFeedbackStore());
const { t } = useI18n();
</script>
