<template>
  <section :class="adminPageScroll">
    <div class="mb-3.5 flex shrink-0 items-start justify-between max-desktop:flex-wrap max-narrow:gap-3.75">
      <div>
        <h2 class="text-2xl font-bold">{{ t("serverSettings") }}</h2>
        <p class="mt-1.75 text-xs text-fg-muted">{{ t("serverSettingsLead") }}</p>
      </div>
      <Button :loading="savingSettings" @click="saveServerSettings()">{{ savingSettings ? t("saving") : t("saveChanges") }}</Button>
    </div>
    <div class="grid min-w-0 shrink-0 grid-cols-2 items-start gap-3.5 max-desktop:grid-cols-1">
      <ServersCard />
      <AccessIdentityCard />
      <AdvancedSettingsCard />
      <RelayNodesCard />
    </div>
    <article class="mt-3 shrink-0 rounded-lg border border-line bg-surface-1 px-4 py-3.5">
      <h3 class="text-md font-bold">{{ t("runtimeFacts") }}</h3>
      <dl class="mt-2.5 grid grid-cols-4 gap-2 max-desktop:grid-cols-2 max-narrow:grid-cols-1">
        <div class="rounded-md bg-surface-0 p-3.25">
          <dt class="text-2xs text-fg-muted">{{ t("internalPort") }}</dt>
          <dd class="mt-1.25 text-xs font-bold">{{ serverForm.internalPort ?? "—" }}</dd>
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
import { adminPageScroll } from "@/features/admin/adminPage";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useI18n } from "@/shared/i18n/useI18n";
import { useAdminServerSettingsStore } from "@/features/admin/adminServerSettings";
import AccessIdentityCard from "@/features/admin/AccessIdentityCard.vue";
import AdvancedSettingsCard from "@/features/admin/AdvancedSettingsCard.vue";
import RelayNodesCard from "@/features/admin/RelayNodesCard.vue";
import ServersCard from "@/features/admin/ServersCard.vue";

const settings = useAdminServerSettingsStore();
const { serverForm, savingSettings, webrtcPortNoticeOpen, webrtcPortRangeText } = storeToRefs(settings);
const { saveServerSettings } = settings;
const { t } = useI18n();
</script>
