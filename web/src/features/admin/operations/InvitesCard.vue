<template>
  <Card as="article" padding="dense" class="min-h-0 overflow-y-auto max-desktop:overflow-visible">
    <header class="flex items-start justify-between gap-3.75">
      <div>
        <h3 class="text-md font-bold">{{ t("invites") }}</h3>
        <p class="mt-1.25 text-2xs leading-tight text-fg-muted">{{ t("invitesLead") }}</p>
      </div>
    </header>
    <form class="mt-2 grid gap-1.5" @submit.prevent="createInvite()">
      <Field :label="t('inviteChannel')" class="gap-1">
        <Input
          v-model.trim="inviteForm.channel"
          :input-class="inviteInputClass"
          maxlength="100"
          :placeholder="t('inviteChannelPlaceholder')"
        />
      </Field>
      <div class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
        <Field :label="t('expiresIn')" class="gap-1">
          <Input v-model.number="inviteForm.expiresInHours" :input-class="inviteInputClass" type="number" min="1" max="720" />
        </Field>
        <Field :label="t('maxUses')" class="gap-1">
          <Input v-model.number="inviteForm.maxUses" :input-class="inviteInputClass" type="number" min="0" max="10000" />
        </Field>
      </div>
      <small class="-mt-1 text-2xs text-fg-muted">{{ t("unlimitedUses") }}</small>
      <Button type="submit" size="sm" :loading="submitting">{{ t("createInvite") }}</Button>
    </form>
    <div v-if="createdInvite" class="mt-4.25 grid gap-2 rounded-md bg-accent-soft p-3 text-accent">
      <strong class="text-caption">{{ t("inviteCreated") }}</strong>
      <div class="flex gap-1.5 max-narrow:grid">
        <Input :model-value="createdInvite.link" readonly :aria-label="t('inviteCreated')" input-class="h-9 px-2 text-2xs" />
        <Button variant="secondary" size="sm" @click="copyInviteLink()">{{ t("copyLink") }}</Button>
      </div>
      <small class="text-2xs leading-snug text-fg-muted">{{ t("inviteSecurity") }}</small>
    </div>
    <div
      v-if="operations.invites.length"
      class="mt-4.5 grid max-h-33 gap-2.25 overflow-y-auto border-t border-line pt-3.75 max-desktop:max-h-none max-desktop:overflow-visible"
    >
      <!-- `invite-row` is the e2e locator -->
      <div
        v-for="invite in operations.invites"
        :key="invite.id"
        class="invite-row flex items-center justify-between gap-2.25 rounded-md bg-surface-0 p-2.5 max-narrow:flex-col max-narrow:items-start"
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
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Chip } from "@/shared/ui/chip";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { useI18n } from "@/shared/i18n/useI18n";
import { createAdminFormat } from "../adminFormat";
import { useAdminOperationsStore } from "../adminOperations";
import { useAdminSessionStore } from "../adminSession";

const { submitting } = storeToRefs(useAdminSessionStore());
const operationsStore = useAdminOperationsStore();
const { operations, inviteForm, createdInvite } = storeToRefs(operationsStore);
const { createInvite, revokeInvite, copyInviteLink } = operationsStore;

const { language, t } = useI18n();
const { formatDate, inviteStatusLabel } = createAdminFormat(language, t);

// The invite card sits in a fixed-height row, so its controls are 34 px tall.
const inviteInputClass = "h-8.5 px-2.5 py-1.75";
</script>
