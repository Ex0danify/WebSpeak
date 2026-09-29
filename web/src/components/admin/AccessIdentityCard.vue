<template>
    <article class="settings-card">
      <h3>{{ t('accessAndIdentity') }}</h3>
      <div class="grid gap-2">
        <Label id="access-mode-label">{{ t('accessMode') }}</Label>
        <RadioGroup v-model="serverForm.accessMode" aria-labelledby="access-mode-label" class="gap-2.5">
          <Radio value="fixed" :class="choiceClass">
            <span class="block text-xs font-bold">{{ t('fixedMode') }}</span>
            <span class="mt-1 block text-[10px] leading-[1.45] text-fg-muted">{{ t('fixedModeLead') }}</span>
          </Radio>
          <Radio value="open" :class="choiceClass">
            <span class="block text-xs font-bold">{{ t('openMode') }}</span>
            <span class="mt-1 block text-[10px] leading-[1.45] text-fg-muted">{{ t('openModeLead') }}</span>
          </Radio>
        </RadioGroup>
      </div>
      <Field :label="t('siteName')"><Input v-model.trim="serverForm.siteName" maxlength="80" /></Field>
      <div class="welcome-editor">
        <div class="welcome-editor-heading">
          <Field :label="t('welcomeLanguage')">
            <Select v-model="welcomeLanguage"><option v-for="option in welcomeLanguageOptions" :key="option.value" :value="option.value">{{ option.label }}</option></Select>
          </Field>
          <small>{{ t('welcomeLanguageHint') }}</small>
        </div>
        <Field id="welcome-text" :label="`${t('welcomeText')} · ${selectedWelcomeLanguageLabel}`" :hint="t('welcomeFallbackHint')">
          <Textarea v-model="selectedWelcomeText" maxlength="500" :rows="4" :placeholder="selectedWelcomeDefault" />
        </Field>
      </div>
    </article>
</template>

<script setup lang="ts">
import { Field, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { storeToRefs } from "pinia";
import { useAdminServerSettingsStore, welcomeLanguageOptions } from "@/stores/adminServerSettings";
import { useI18n } from "@/i18n/use-i18n";

const { serverForm, welcomeLanguage, selectedWelcomeText, selectedWelcomeLanguageLabel, selectedWelcomeDefault } = storeToRefs(useAdminServerSettingsStore());
const { t } = useI18n();
const choiceClass = "w-full rounded-md border border-line p-2.5 has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-surface-0";
</script>

<style scoped>
.settings-card h3 { margin: 0; font-size: 15px; font-weight: 700; }
.welcome-editor{display:grid;gap:10px;padding:12px;background:var(--ws-surface-0);border:1px solid var(--ws-line);border-radius:10px}
.welcome-editor-heading{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,1fr);align-items:end;gap:12px}
.welcome-editor-heading>small{margin:0;color:var(--ws-fg-muted);font-size:10px;line-height:1.5}
@media(max-width:520px){.welcome-editor-heading{grid-template-columns:1fr;gap:6px}}
.server-page .settings-card input{height:40px}
</style>
