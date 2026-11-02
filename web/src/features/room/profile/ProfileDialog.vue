<template>
  <Dialog v-model="open" size="sm" :title="t('profileMenu')" :close-label="t('close')">
    <Tabs v-model="tab">
      <TabList :aria-label="t('profileSections')">
        <Tab value="profile">{{ t("profileTab") }}</Tab>
        <Tab value="identity">{{ t("identityTab") }}</Tab>
      </TabList>
      <!-- Both panels share one minimum height, so the dialog keeps its size when switching tabs. -->
      <TabPanel value="profile" :class="panelClass">
        <div v-if="member" class="flex items-center gap-3">
          <Avatar :name="member.nickname" :src="member.avatar || undefined" size="xl" surface="surface-1" tint self />
          <div class="flex min-w-0 flex-col gap-1">
            <strong class="truncate text-sm text-fg">{{ nicknameText(member.nickname, t, member.unnamed) }}</strong>
            <span v-if="member.uid" class="flex min-w-0 items-center gap-1">
              <code class="truncate text-2xs text-fg-muted" :title="member.uid">{{ member.uid }}</code>
              <Tooltip :text="t('copyUid')"
                ><Button variant="ghost" size="sm" icon-only :aria-label="t('copyUid')" @click="copyUid(member.uid)"
                  ><Icon name="copy" :size="14" /></Button
              ></Tooltip>
            </span>
          </div>
        </div>
      </TabPanel>
      <TabPanel value="identity" :class="`${panelClass} flex flex-col gap-5`">
        <section class="flex flex-col gap-3" :aria-labelledby="thisIdentityId">
          <h3 :id="thisIdentityId" class="m-0 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {{ t("identitySectionTitle") }}
          </h3>
          <div aria-live="polite">
            <Chip v-if="savedIdentity" variant="success"
              ><template #icon><Icon name="check" :size="13" /></template>{{ t("identitySavedStatus") }}</Chip
            >
            <Chip v-else>{{ t("identityTemporaryStatus") }}</Chip>
          </div>
          <p v-if="!savedIdentity" class="m-0 text-sm text-fg-muted">{{ t("identityTemporary") }}</p>
          <div v-if="savedIdentity && renaming" class="flex flex-wrap items-end gap-2">
            <Field id="profile-identity-rename" :label="t('identityRenameTitle')" class="min-w-0 flex-1">
              <Input v-model.trim="renameLabel" maxlength="40" autofocus @keyup.enter="confirmRename" />
            </Field>
            <Button @click="confirmRename">{{ t("identitySave") }}</Button>
            <Button variant="ghost" @click="renaming = false">{{ t("identityCancel") }}</Button>
          </div>
          <div v-else-if="savedIdentity" class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="block text-xs text-fg-muted">{{ t("identityNameLabel") }}</span>
              <strong class="block truncate text-sm text-fg">{{ savedName }}</strong>
            </div>
            <Button variant="outline" @click="startRename">{{ t("identityRename") }}</Button>
          </div>
          <div v-else class="flex flex-wrap items-end gap-2">
            <Field id="profile-identity-name" :label="t('identityNameLabel')" class="min-w-0 flex-1">
              <Input v-model.trim="name" maxlength="40" @keyup.enter="saveIdentity" />
            </Field>
            <Button :disabled="busy" @click="saveIdentity">{{ t("identitySaveToDevice") }}</Button>
          </div>
        </section>
        <Separator />
        <section class="flex flex-col gap-3" :aria-labelledby="backupId">
          <h3 :id="backupId" class="m-0 text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ t("identityBackupTitle") }}</h3>
          <p class="m-0 text-sm text-fg-muted">{{ t("identityExportHint") }}</p>
          <Banner v-if="exported" variant="warning">{{ t("identityExportWarning") }}</Banner>
          <Banner v-if="failed" variant="danger">{{ t("identityRequestFailed") }}</Banner>
          <Button variant="outline" class="self-start" :disabled="busy" @click="exportIdentity"
            ><Icon name="download" :size="16" /> {{ t("identityExport") }}</Button
          >
        </section>
      </TabPanel>
    </Tabs>
    <template #footer
      ><Button @click="open = false">{{ t("done") }}</Button></template
    >
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Avatar } from "@/shared/ui/avatar";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Tab, TabList, TabPanel, Tabs } from "@/shared/ui/tabs";
import { Tooltip } from "@/shared/ui/tooltip";
import { toast } from "@/shared/composables/useToast";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { downloadIdentity, useIdentityManager } from "@/features/identity";
import { nicknameText, type ChannelMember } from "@/features/session";

const props = defineProps<{
  /** The local user. */
  member: ChannelMember | null;
  /** The key of a remembered identity, empty for a temporary one. */
  identityMaterial: string;
  /** Asks the gateway for the private key of the identity in use. */
  requestIdentity: () => Promise<string>;
}>();
const open = defineModel<boolean>({ required: true });
// Kept by the room, so a temporary identity saved earlier still shows as saved after the dialog was closed.
const savedId = defineModel<string | null>("savedId", { default: null });
const { t } = useI18n();

const panelClass = "min-h-96 pt-4";
const manager = useIdentityManager();
const thisIdentityId = useId();
const backupId = useId();
const tab = ref("profile");
const busy = ref(false);
// The private-key warning only shows once a file was actually saved.
const exported = ref(false);
const failed = ref(false);
const name = ref("");
const renaming = ref(false);
const renameLabel = ref("");

const savedIdentity = computed(() =>
  manager.identities.value.find(
    (entry) => entry.id === savedId.value || (props.identityMaterial !== "" && entry.privateMaterial === props.identityMaterial),
  ),
);
const savedName = computed(() => savedIdentity.value?.label || t("identityUnnamed"));

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      void manager.refresh();
      name.value = props.member?.nickname ?? "";
    } else {
      exported.value = false;
      failed.value = false;
      renaming.value = false;
      tab.value = "profile";
    }
  },
  { immediate: true },
);

/** The key is fetched per click and not kept, so it sits in the page only while it is being used. */
async function withIdentity(use: (privateMaterial: string) => Promise<void> | void): Promise<void> {
  busy.value = true;
  failed.value = false;
  try {
    const privateMaterial = await props.requestIdentity();
    if (!privateMaterial) throw new Error("empty identity");
    await use(privateMaterial);
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}

function exportIdentity(): Promise<void> {
  return withIdentity((privateMaterial) => {
    downloadIdentity({ label: savedIdentity.value?.label || props.member?.nickname, privateMaterial });
    exported.value = true;
    toast(t("identityExportedToast"));
  });
}

function saveIdentity(): Promise<void> {
  return withIdentity(async (privateMaterial) => {
    const existing = manager.identities.value.find((entry) => entry.privateMaterial === privateMaterial);
    if (existing) {
      savedId.value = existing.id;
      return;
    }
    const result = await manager.importIdentity(privateMaterial, name.value || props.member?.nickname);
    if (!result.ok) throw new Error(result.code);
    savedId.value = result.identity.id;
  });
}

function startRename(): void {
  renameLabel.value = savedIdentity.value?.label ?? "";
  renaming.value = true;
}

async function confirmRename(): Promise<void> {
  const id = savedIdentity.value?.id;
  if (id && renameLabel.value) await manager.rename(id, renameLabel.value);
  renaming.value = false;
}

function copyUid(uid: string | undefined): void {
  if (!uid) return;
  navigator.clipboard?.writeText(uid).then(
    () => toast(t("uidCopiedToast")),
    () => toast({ title: t("uidCopyFailedToast"), variant: "danger" }),
  );
}
</script>
