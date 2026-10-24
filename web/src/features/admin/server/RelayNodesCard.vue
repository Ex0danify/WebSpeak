<template>
  <AdminSection :title="t('relaySettings')" :lead="t('relaySettingsLead')" :status="statuses.relay" body-class="grid content-start gap-3">
    <div
      v-if="!serverForm.relayNodes.length"
      class="rounded-md border border-dashed border-line bg-surface-0 px-3 py-2.5 text-caption text-fg-muted"
    >
      {{ t("relayNodeEmpty") }}
    </div>
    <div class="grid gap-2.5">
      <div
        v-for="(relay, index) in serverForm.relayNodes"
        :key="relay.id"
        class="grid min-w-0 gap-2.5 rounded-lg border border-line bg-surface-0 p-3"
      >
        <div class="flex min-w-0 items-center justify-between gap-2.5">
          <Checkbox v-model="relay.enabled" class="min-w-0" @update:model-value="scheduleSave('relay')"
            ><strong class="block truncate text-xs">{{ relay.name || t("relayUnnamed") }}</strong></Checkbox
          >
          <Button variant="dangerSoft" size="sm" @click="removeRelayNode(index)">{{ t("remove") }}</Button>
        </div>
        <div class="grid min-w-0 grid-cols-1 gap-3 desktop:grid-cols-2">
          <Field :label="t('relayName')" :error="issueText(`relay:${relay.id}:name`)"
            ><Input v-model.trim="relay.name" maxlength="80" :placeholder="t('relayNamePlaceholder')" @change="scheduleSave('relay')"
          /></Field>
          <Field :label="t('relayTarget')" :error="issueText(`relay:${relay.id}:target`)"
            ><Input v-model.trim="relay.target" maxlength="300" :placeholder="t('relayTargetPlaceholder')" @change="scheduleSave('relay')"
          /></Field>
          <div class="col-span-full grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2.25 max-narrow:grid-cols-1">
            <Field :label="t('relayToken')" :error="issueText(`relay:${relay.id}:token`)"
              ><Input
                v-model="relay.token"
                type="password"
                autocomplete="off"
                :disabled="relay.tokenAction !== 'replace'"
                :placeholder="relay.hasToken ? t('relayTokenConfigured') : t('relayTokenPlaceholder')"
                @change="scheduleSave('relay')"
            /></Field>
            <Segmented
              v-model="relay.tokenAction"
              :aria-label="t('relayToken')"
              class="h-10 items-center self-end justify-self-start"
              @update:model-value="scheduleSave('relay')"
            >
              <Segment value="replace">{{ t("change") }}</Segment>
              <Segment v-if="relay.hasToken" value="remove">{{ t("remove") }}</Segment>
            </Segmented>
          </div>
        </div>
      </div>
    </div>
    <Button variant="secondary" size="sm" class="justify-self-start" @click="addRelayNode()">{{ t("relayAdd") }}</Button>
    <small class="-mt-2 text-2xs leading-[1.55] text-fg-muted">{{ t("relayManagedHint") }}</small>
  </AdminSection>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { storeToRefs } from "pinia";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminServerSettingsStore } from "@/features/admin/server/adminServerSettings";
import { useI18n } from "@/shared/i18n/useI18n";

const settings = useAdminServerSettingsStore();
const { serverForm } = storeToRefs(settings);
const { statuses, issueText, scheduleSave, addRelayNode, removeRelayNode } = settings;
const { t } = useI18n();
</script>
