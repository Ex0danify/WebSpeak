<template>
  <main :class="authPage">
    <Card as="section" padding="xl" raised :class="authCard">
      <AdminBrand />
      <header class="mt-7.5 mb-6">
        <h1 class="mt-2.5 mb-1.75 text-3xl font-bold tracking-brand">{{ t("changePasswordTitle") }}</h1>
        <p class="text-ui leading-relaxed text-fg-muted">{{ t("changePasswordLead") }}</p>
      </header>
      <form class="mt-6.75 grid gap-4.25" @submit.prevent="changePassword()">
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
        <Button type="submit" class="w-full" :loading="changingPassword">{{ t("savePassword") }}</Button>
      </form>
      <p class="mt-4.5 text-caption leading-normal text-fg-muted">{{ t("defaultCredentialNotice") }}</p>
      <AdminLanguageSwitcher class="mt-5" />
    </Card>
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import AdminBrand from "@/features/admin/AdminBrand.vue";
import AdminLanguageSwitcher from "@/features/admin/AdminLanguageSwitcher.vue";
import { authCard, authPage } from "@/features/admin/adminChrome";
import { useAdminFeedbackStore } from "@/features/admin/adminFeedback";
import { useAdminSessionStore } from "@/features/admin/adminSession";
import { useI18n } from "@/shared/i18n/useI18n";

const session = useAdminSessionStore();
const { newPassword, confirmNewPassword, passwordStrength, changingPassword } = storeToRefs(session);
const { changePassword } = session;
const { errorMessage } = storeToRefs(useAdminFeedbackStore());
const { t } = useI18n();
</script>
