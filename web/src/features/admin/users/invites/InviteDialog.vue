<template>
  <Dialog
    v-model="inviteDialogOpen"
    size="md"
    :title="createdInvite ? t('inviteCreated') : t('createInvite')"
    :close-label="t('close')"
    :dismissible="!creatingInvite"
  >
    <div v-if="createdInvite" class="grid gap-2 pb-2">
      <div class="flex items-center gap-2">
        <Input :model-value="createdInvite.link" readonly :aria-label="t('inviteCreated')" class="min-w-0 flex-1" input-class="text-2xs" />
        <Button variant="secondary" class="shrink-0" autofocus @click="copyInviteLink()"
          ><Icon name="copy" :size="16" />{{ t("copyLink") }}</Button
        >
      </div>
      <small class="text-2xs leading-snug text-fg-muted">{{ t("inviteSecurity") }}</small>
    </div>
    <form v-else id="invite-form" class="grid gap-3" @submit.prevent="createInvite()">
      <Banner v-if="inviteError" variant="danger">{{ inviteError }}</Banner>
      <Field :label="t('server')">
        <ListSelect v-model="inviteForm.serverId" :items="serverItems" />
      </Field>
      <Field :label="t('inviteChannel')">
        <Input v-model.trim="inviteForm.channel" maxlength="100" :placeholder="t('inviteChannelPlaceholder')" />
      </Field>
      <div class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
        <Field :label="t('expiresIn')">
          <Input v-model.number="inviteForm.expiresInHours" type="number" min="1" max="720" />
        </Field>
        <Field :label="t('maxUses')" :hint="t('unlimitedUses')">
          <Input v-model.number="inviteForm.maxUses" type="number" min="0" max="10000" />
        </Field>
      </div>
    </form>
    <template v-if="!createdInvite" #footer>
      <Button variant="ghost" :disabled="creatingInvite" @click="inviteDialogOpen = false">{{ t("confirmCancel") }}</Button>
      <Button type="submit" form="invite-form" :loading="creatingInvite">{{ t("create") }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { ListSelect, type ListSelectItem } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n";
import { adminSiblings } from "@/features/admin/core/adminSiblings";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";

const usersStore = useAdminInvitesStore();
const { inviteForm, createdInvite, creatingInvite, inviteDialogOpen, inviteError } = storeToRefs(usersStore);
const { createInvite, copyInviteLink } = usersStore;
// The list belongs to the server page, so it is read through the siblings.
const servers = computed(() => adminSiblings().serverList());
const serverItems = computed<ListSelectItem[]>(() => servers.value.map((server) => ({ value: server.id, label: server.name })));

// An invite is made for one server, the first is the default and a removed one cannot stay selected.
watch(
  servers,
  (list) => {
    if (!list.some((server) => server.id === inviteForm.value.serverId)) inviteForm.value.serverId = list[0]?.id ?? "";
  },
  { immediate: true },
);

const { t } = useI18n();
</script>
