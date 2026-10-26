<template>
  <ScrollRegion :label="t('sessions')" size="none">
    <table class="w-full min-w-150 border-collapse text-left max-narrow:min-w-0">
      <thead>
        <tr>
          <th :class="th">{{ t("sessionNickname") }}</th>
          <th :class="th">{{ t("sessionState") }}</th>
          <th :class="[th, 'max-narrow:hidden']">{{ t("age") }}</th>
          <th :class="[th, 'max-narrow:hidden']">{{ t("memberCount") }}</th>
          <th :class="th">
            <span class="sr-only">{{ t("sessionActions") }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="session in sessions" :key="session.id">
          <td :class="[td, 'max-narrow:wrap-anywhere max-narrow:whitespace-normal']">
            <strong class="block">{{ session.nickname }}</strong>
            <small :class="tdSmall">{{ session.target }}</small>
          </td>
          <td :class="td">
            <Chip variant="accent">{{ sessionStateLabel(session.state) }}</Chip>
          </td>
          <td :class="[td, 'max-narrow:hidden']">{{ formatAge(session.ageSeconds) }}</td>
          <td :class="[td, 'max-narrow:hidden']">{{ session.memberCount }}</td>
          <td :class="td">
            <Button variant="dangerSoft" size="xs" :disabled="terminatingSession === session.id" @click="terminateSession(session)">
              {{ terminatingSession === session.id ? t("terminating") : t("endSession") }}
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  </ScrollRegion>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { useI18n } from "@/shared/i18n/useI18n";
import ScrollRegion from "@/features/admin/ui/ScrollRegion.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import type { AdminSession } from "@/features/admin/core/adminTypes";
import { useAdminUsersStore } from "@/features/admin/users/adminUsers";

defineProps<{ sessions: AdminSession[] }>();

const usersStore = useAdminUsersStore();
const { terminatingSession } = storeToRefs(usersStore);
const { terminateSession } = usersStore;

const { language, t } = useI18n();
const { formatAge, sessionStateLabel } = createAdminFormat(language, t);

const th = "border-b border-line px-3.5 py-3 text-2xs font-bold whitespace-nowrap text-fg-muted";
const td = "border-b border-line px-3.5 py-3 text-caption whitespace-nowrap";
const tdSmall = "mt-0.75 block text-2xs text-fg-muted";
</script>
