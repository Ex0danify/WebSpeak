<template>
  <AdminSection :title="t('invites')" :lead="t('invitesLead')" padding="dense" leading="tight">
    <form class="mt-2 grid gap-1.5" @submit.prevent="createInvite()">
      <Field :label="t('server')" class="gap-1">
        <Select v-model="inviteForm.serverId" :select-class="inputClass"
          ><option v-for="server in servers" :key="server.id" :value="server.id">{{ server.name }}</option></Select
        >
      </Field>
      <Field :label="t('inviteChannel')" class="gap-1">
        <Input v-model.trim="inviteForm.channel" :input-class="inputClass" maxlength="100" :placeholder="t('inviteChannelPlaceholder')" />
      </Field>
      <div class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
        <Field :label="t('expiresIn')" class="gap-1">
          <Input v-model.number="inviteForm.expiresInHours" :input-class="inputClass" type="number" min="1" max="720" />
        </Field>
        <Field :label="t('maxUses')" class="gap-1">
          <Input v-model.number="inviteForm.maxUses" :input-class="inputClass" type="number" min="0" max="10000" />
        </Field>
      </div>
      <small class="-mt-1 text-2xs text-fg-muted">{{ t("unlimitedUses") }}</small>
      <Button type="submit" size="sm" :loading="creatingInvite">{{ t("createInvite") }}</Button>
    </form>
    <div v-if="createdInvite" class="mt-4.25 grid gap-2 rounded-md bg-accent-soft p-3 text-accent">
      <strong class="text-caption">{{ t("inviteCreated") }}</strong>
      <div class="flex gap-1.5 max-narrow:grid">
        <Input :model-value="createdInvite.link" readonly :aria-label="t('inviteCreated')" input-class="h-9 px-2 text-2xs" />
        <Button variant="secondary" size="sm" @click="copyInviteLink()">{{ t("copyLink") }}</Button>
      </div>
      <small class="text-2xs leading-snug text-fg-muted">{{ t("inviteSecurity") }}</small>
    </div>
    <div v-if="operations.invites.length" :class="['mt-4.5 grid gap-2.25 border-t border-line pt-3.75', listClass]">
      <!-- `invite-row` is the e2e locator -->
      <AdminListRow
        v-for="invite in operations.invites"
        :key="invite.id"
        class="invite-row flex items-center justify-between gap-2.25 max-narrow:flex-col max-narrow:items-start"
      >
        <div class="min-w-0">
          <strong class="block truncate text-caption">{{ invite.channel || t("defaultChannel") }}</strong>
          <small class="mt-1 block max-w-65 truncate text-2xs text-fg-muted"
            >{{ invite.target }} · {{ formatDate(invite.expiresAt) }}</small
          >
        </div>
        <div class="flex flex-none items-center gap-1.75 text-2xs text-fg-muted max-narrow:w-full max-narrow:justify-end">
          <Chip :variant="invite.status === 'active' ? 'accent' : 'danger'">{{ inviteStatusLabel(invite.status) }}</Chip>
          <span>{{ invite.useCount }}/{{ invite.maxUses || "∞" }}</span>
          <Button v-if="invite.status === 'active'" variant="dangerSoft" size="xs" @click="revokeInvite(invite)">{{ t("revoke") }}</Button>
        </div>
      </AdminListRow>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListRow from "@/features/admin/AdminListRow.vue";
import AdminSection from "@/features/admin/AdminSection.vue";
import { createAdminFormat } from "@/features/admin/adminFormat";
import { useAdminOperationsStore } from "@/features/admin/adminOperations";
import { useAdminServersStore } from "@/features/admin/adminServers";

const operationsStore = useAdminOperationsStore();
/** `listClass` frames the invite list, `inputClass` sizes the form's controls: both are up to the page. */
defineProps<{ listClass?: string; inputClass?: string }>();

const { operations, inviteForm, createdInvite, creatingInvite } = storeToRefs(operationsStore);
const { createInvite, revokeInvite, copyInviteLink } = operationsStore;
const { servers } = storeToRefs(useAdminServersStore());

// An invite is made for one server, the first is the default and a removed one cannot stay selected.
watch(
  servers,
  (list) => {
    if (!list.some((server) => server.id === inviteForm.value.serverId)) inviteForm.value.serverId = list[0]?.id ?? "";
  },
  { immediate: true },
);

const { language, t } = useI18n();
const { formatDate, inviteStatusLabel } = createAdminFormat(language, t);
</script>
