<template>
  <!-- `invite-row` is the e2e locator -->
  <AdminListRow as="li" bordered class="invite-row flex min-w-0 items-center gap-3 max-narrow:flex-wrap">
    <div class="min-w-0 flex-1 max-narrow:basis-40">
      <strong class="block truncate text-xs max-narrow:overflow-visible max-narrow:wrap-anywhere max-narrow:whitespace-normal">{{
        invite.channel || t("defaultChannel")
      }}</strong>
      <span class="mt-0.5 block truncate font-mono text-2xs text-fg-muted max-narrow:overflow-visible max-narrow:whitespace-normal">{{
        invite.target
      }}</span>
      <span class="mt-0.5 block text-2xs text-fg-muted">{{ t("inviteExpires", { date: formatDate(invite.expiresAt) }) }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-3 text-2xs text-fg-muted">
      <Chip :variant="invite.status === 'active' ? 'accent' : 'danger'">{{ inviteStatusLabel(invite.status) }}</Chip>
      <span>{{ usedText }}</span>
      <Button
        v-if="invite.status === 'active'"
        variant="dangerSoft"
        size="sm"
        :aria-label="t('revokeInviteNamed', { name: invite.channel || t('defaultChannel') })"
        @click="revokeInvite(invite)"
        >{{ t("revoke") }}</Button
      >
    </div>
  </AdminListRow>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import type { ManagedInvite } from "@/features/admin/core/adminTypes";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";

const props = defineProps<{ invite: ManagedInvite }>();

const { revokeInvite } = useAdminInvitesStore();
const { language, t } = useI18n();
const { formatDate, inviteStatusLabel } = createAdminFormat(language, t);

const usedText = computed(() =>
  props.invite.maxUses
    ? t("inviteUsed", { used: props.invite.useCount, max: props.invite.maxUses })
    : t("inviteUsedUnlimited", { used: props.invite.useCount }),
);
</script>
