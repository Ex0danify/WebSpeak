<template>
  <section :class="adminPageScroll">
    <div class="mb-3.5 flex shrink-0 items-start justify-between max-desktop:flex-wrap max-narrow:gap-3.75">
      <div>
        <h2 class="text-2xl font-bold">{{ t("serverSettings") }}</h2>
        <p class="mt-1.75 text-xs text-fg-muted">{{ t("serverSettingsLead") }}</p>
      </div>
      <Button :loading="submitting" @click="saveServerSettings()">{{ submitting ? t("saving") : t("saveChanges") }}</Button>
    </div>
    <div class="grid min-w-0 shrink-0 grid-cols-2 items-start gap-3.5 max-desktop:grid-cols-1">
      <TeamSpeakTargetCard />
      <AccessIdentityCard />
      <AdvancedSettingsCard />
      <RelayNodesCard />
    </div>
    <article class="mt-3 shrink-0 rounded-lg border border-line bg-surface-1 px-4 py-3.5">
      <h3 class="text-md font-bold">{{ t("runtimeFacts") }}</h3>
      <dl class="mt-2.5 grid grid-cols-4 gap-2 max-desktop:grid-cols-2 max-narrow:grid-cols-1">
        <div class="rounded-md bg-surface-0 p-3.25">
          <dt class="text-2xs text-fg-muted">{{ t("lastTest") }}</dt>
          <dd class="mt-1.25 text-xs font-bold">{{ formatDate(serverForm.lastTestAt) }}</dd>
        </div>
        <div class="rounded-md bg-surface-0 p-3.25">
          <dt class="text-2xs text-fg-muted">{{ t("latency") }}</dt>
          <dd class="mt-1.25 text-xs font-bold">{{ serverForm.lastTestLatencyMs == null ? "—" : `${serverForm.lastTestLatencyMs} ms` }}</dd>
        </div>
        <div class="rounded-md bg-surface-0 p-3.25">
          <dt class="text-2xs text-fg-muted">{{ t("internalPort") }}</dt>
          <dd class="mt-1.25 text-xs font-bold">3040</dd>
        </div>
      </dl>
    </article>
    <Dialog
      v-model="webrtcPortNoticeOpen"
      size="sm"
      :title="t('webrtcPortNoticeTitle')"
      :description="t('webrtcPortNotice', { range: webrtcPortRangeText })"
      :close-label="t('close')"
    >
      <template #footer
        ><Button class="w-full" @click="webrtcPortNoticeOpen = false">{{ t("gotIt") }}</Button></template
      >
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { adminPageScroll } from "./adminPage";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { createAdminFormat } from "./adminFormat";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminServerSettingsStore } from "./adminServerSettings";
import { useAdminSessionStore } from "./adminSession";
import AccessIdentityCard from "./AccessIdentityCard.vue";
import AdvancedSettingsCard from "./AdvancedSettingsCard.vue";
import RelayNodesCard from "./RelayNodesCard.vue";
import TeamSpeakTargetCard from "./TeamSpeakTargetCard.vue";

const settings = useAdminServerSettingsStore();
const { serverForm, webrtcPortNoticeOpen, webrtcPortRangeText } = storeToRefs(settings);
const { saveServerSettings } = settings;
const { submitting } = storeToRefs(useAdminSessionStore());

const { language, t } = useI18n();
const { formatDate } = createAdminFormat(language, t);
</script>
