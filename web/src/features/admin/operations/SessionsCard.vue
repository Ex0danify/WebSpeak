<template>
  <Card as="article" padding="dense" class="min-h-0 overflow-y-auto max-desktop:overflow-visible">
    <header class="flex items-start justify-between gap-3.75">
      <div>
        <h3 class="text-md font-bold">{{ t("sessions") }}</h3>
        <p class="mt-1.25 text-2xs leading-tight text-fg-muted">{{ t("sessionsLead") }}</p>
      </div>
      <strong class="text-xl text-accent">{{ operations.sessions.length }}</strong>
    </header>
    <div
      v-if="operations.sessions.length"
      class="-mx-5.5 mt-4.5 -mb-5.5 max-h-47.5 overflow-auto border-t border-line max-desktop:max-h-none max-narrow:-mx-4.5 max-narrow:-mb-4.5"
    >
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
          <tr v-for="session in operations.sessions" :key="session.id">
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
    </div>
    <div v-else class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted">
      <Icon name="users" :size="22" class="text-accent" />
      <span>{{ t("sessionEmpty") }}</span>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import { createAdminFormat } from "../adminFormat";
import { useAdminOperationsStore } from "../adminOperations";

const operationsStore = useAdminOperationsStore();
const { operations, terminatingSession } = storeToRefs(operationsStore);
const { terminateSession } = operationsStore;

const { language, t } = useI18n();
const { formatAge, sessionStateLabel } = createAdminFormat(language, t);

const th = "border-b border-line px-3.5 py-3 text-2xs font-bold whitespace-nowrap text-fg-muted";
const td = "border-b border-line px-3.5 py-3 text-caption whitespace-nowrap";
const tdSmall = "mt-0.75 block text-2xs text-fg-muted";
</script>
