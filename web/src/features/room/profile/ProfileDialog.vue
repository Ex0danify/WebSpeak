<template>
  <Dialog v-model="open" size="sm" :title="t('profileMenu')" :close-label="t('close')" :class="anchorTop">
    <!-- Stays in view while a tab scrolls. The negative margin pulls it over the body's top padding, so it covers it. -->
    <header v-if="member" class="sticky top-0 z-10 -mt-3 flex flex-col items-center gap-3 bg-surface-1 pb-4 text-center">
      <Avatar :name="member.nickname" :src="member.avatar || undefined" size="xl" surface="surface-1" tint self />
      <!-- The name stays centered in both states, the buttons hang off its end and do not push it. -->
      <form v-if="editing" class="relative -mt-2 w-52" @submit.prevent="saveNickname">
        <Field id="profile-nickname" :error="nicknameStatus.error" class="text-center">
          <Input
            ref="nicknameInput"
            v-model.trim="nickname"
            look="inline"
            :maxlength="NICKNAME_MAX"
            autocomplete="off"
            :aria-label="t('nicknameInputLabel')"
          >
            <template #trailing
              ><span aria-hidden="true" class="text-2xs font-normal text-fg-muted tabular-nums"
                >{{ nickname.length }}/{{ NICKNAME_MAX }}</span
              ></template
            >
          </Input>
        </Field>
        <span class="absolute top-0 left-full ml-3 flex h-9 items-center">
          <Tooltip :text="t('nicknameSave')"
            ><Button
              type="submit"
              variant="quietSuccess"
              size="sm"
              icon-only
              :aria-label="t('nicknameSave')"
              :disabled="!nicknameChanged || nicknameBusy"
              ><Icon name="check" :size="18" /></Button
          ></Tooltip>
          <Tooltip :text="t('cancel')"
            ><Button variant="quietDanger" size="sm" icon-only :aria-label="t('cancel')" @click="stopEditing"
              ><Icon name="close" :size="16" /></Button
          ></Tooltip>
        </span>
      </form>
      <div v-else class="relative -mt-2 max-w-52">
        <strong class="block h-9 truncate text-base leading-9 text-fg" :title="currentNickname">{{
          nicknameText(currentNickname, t, member.unnamed)
        }}</strong>
        <span class="absolute top-0 left-full ml-1.5 flex h-9 items-center gap-1">
          <Tooltip :text="t('nicknameChange')"
            ><Button ref="editButton" variant="ghost" size="sm" icon-only :aria-label="t('nicknameChange')" @click="startEditing"
              ><Icon name="pencil" :size="14" /></Button
          ></Tooltip>
          <SavedHint :status="nicknameStatus" />
        </span>
      </div>
      <span aria-live="polite" class="sr-only">{{ nicknameStatus.state === "saved" ? t("savedStatus") : "" }}</span>
      <span aria-live="polite">
        <Chip v-if="savedIdentity" variant="success"
          ><template #icon><Icon name="check" :size="13" /></template>{{ t("identitySavedStatus") }}</Chip
        >
        <Chip v-else>{{ t("identityTemporaryStatus") }}</Chip>
      </span>
    </header>
    <Tabs v-model="tab">
      <TabList :aria-label="t('profileSections')">
        <Tab value="identity">{{ t("identityTab") }}</Tab>
        <Tab value="connection">{{ t("connectionTab") }}</Tab>
        <Tab value="permissions">{{ t("permissionsTab") }}</Tab>
      </TabList>
      <!-- A shared minimum height keeps the jump between tabs small. -->
      <TabPanel value="identity" :class="`${panelClass} flex flex-col gap-4`">
        <p v-if="!savedIdentity" class="m-0 text-sm text-fg-muted">{{ t("identityTemporary") }}</p>
        <div v-if="member?.uid" class="min-w-0">
          <span class="mb-1 block text-sm font-medium text-fg">{{ t("uniqueIdLabel") }}</span>
          <div class="flex items-start gap-1 rounded-md border border-line bg-surface-2 py-1 pr-1 pl-3">
            <code class="min-w-0 flex-1 py-1.5 font-mono text-xs break-all text-fg">{{ member.uid }}</code>
            <Tooltip :text="t('copyUid')"
              ><Button variant="ghost" size="sm" icon-only :aria-label="t('copyUid')" @click="copyUid(member.uid)"
                ><Icon name="copy" :size="16" /></Button
            ></Tooltip>
          </div>
        </div>
        <Button v-if="!savedIdentity" class="w-full" :disabled="busy" @click="saveIdentity">{{ t("identitySaveToDevice") }}</Button>
        <Separator />
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <span class="block text-sm font-semibold text-fg">{{ t("identityBackupTitle") }}</span>
            <span class="block text-sm text-fg-muted">{{ t("identityExportHint") }}</span>
          </div>
          <Button variant="outline" class="shrink-0" :disabled="busy" @click="exportIdentity"
            ><Icon name="download" :size="16" /> {{ t("identityExport") }}</Button
          >
        </div>
        <Banner v-if="exported" variant="warning">{{ t("identityExportWarning") }}</Banner>
        <Banner v-if="failed" variant="danger">{{ t("identityRequestFailed") }}</Banner>
      </TabPanel>
      <TabPanel value="connection" :class="panelClass"><ConnectionStats :stats="connectionStats" /></TabPanel>
      <TabPanel value="permissions" :class="panelClass"><PermissionList :permissions="permissions" /></TabPanel>
    </Tabs>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Avatar } from "@/shared/ui/avatar";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import ConnectionStats from "@/features/room/profile/ConnectionStats.vue";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { SavedHint } from "@/shared/ui/savedHint";
import { Separator } from "@/shared/ui/separator";
import { Tab, TabList, TabPanel, Tabs } from "@/shared/ui/tabs";
import { Tooltip } from "@/shared/ui/tooltip";
import { toast } from "@/shared/composables/useToast";
import { errorText, resolveText, text } from "@/shared/i18n/localizedText";
import { createSaveStatus } from "@/shared/lib/saveStatus";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { downloadIdentity, useIdentityManager } from "@/features/identity";
import { useConnectionStats, type UseConnectionStatsOptions } from "@/features/room/profile/useConnectionStats";
import PermissionList from "@/features/room/profile/PermissionList.vue";
import { nicknameText, type ChannelMember, type PermissionEntry } from "@/features/session";

const props = defineProps<{
  /** The local user. */
  member: ChannelMember | null;
  /** The key of a remembered identity, empty for a temporary one. */
  identityMaterial: string;
  /** Asks the gateway for the private key of the identity in use. */
  requestIdentity: () => Promise<string>;
  /** Renames the own client, rejects with the reason when the server refuses the name. */
  changeNickname: (nickname: string) => Promise<void>;
  /** The room session's connection part, sampled while the Connection tab is showing. */
  connection: UseConnectionStatsOptions["session"];
  /** Our permissions on this server, as the server reported them. */
  permissions: PermissionEntry[];
}>();
const open = defineModel<boolean>({ required: true });
// Kept by the room, so a temporary identity saved earlier still shows as saved after the dialog was closed.
const savedId = defineModel<string | null>("savedId", { default: null });
const { t } = useI18n();

const panelClass = "min-h-64 pt-4";
// Pinned below the top edge instead of centered, so only the lower part moves when a tab changes the height. Compact screens stay centered.
const anchorTop = "mt-12 max-h-4/5 self-start max-compact:mt-0 max-compact:max-h-full max-compact:self-center";
const manager = useIdentityManager();
const tab = ref("identity");
const connectionStats = useConnectionStats({
  session: props.connection,
  active: () => open.value && tab.value === "connection",
}).stats;
const busy = ref(false);
// The private-key warning only shows once a file was actually saved.
const exported = ref(false);
const failed = ref(false);
const nickname = ref("");
const currentNickname = ref("");
const editing = ref(false);
const nicknameStatus = createSaveStatus();
const nicknameBusy = computed(() => nicknameStatus.state === "saving");
const nicknameInput = ref<{ focus: () => void; select: () => void } | null>(null);
const editButton = ref<{ $el: HTMLElement } | null>(null);

const savedIdentity = computed(() =>
  manager.identities.value.find(
    (entry) => entry.id === savedId.value || (props.identityMaterial !== "" && entry.privateMaterial === props.identityMaterial),
  ),
);

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      void manager.refresh();
      nickname.value = currentNickname.value = props.member?.nickname ?? "";
    } else {
      exported.value = false;
      failed.value = false;
      editing.value = false;
      nicknameStatus.reset();
      tab.value = "identity";
    }
  },
  { immediate: true },
);

// What the server has now, so a rename by someone else shows up in the field unless it is being edited.
watch(
  () => props.member?.nickname,
  (next) => {
    if (next === undefined) return;
    if (nickname.value === currentNickname.value) nickname.value = next;
    currentNickname.value = next;
  },
);
watch(nickname, () => nicknameStatus.clearError());

// The server takes 3 to 30 characters. The field only shows the upper limit as a counter, the lower one keeps Save off.
const NICKNAME_MIN = 3;
const NICKNAME_MAX = 30;
const nicknameChanged = computed(() => nickname.value.length >= NICKNAME_MIN && nickname.value !== currentNickname.value);

// Focus follows the swap, so keyboard and screen reader users are not left on a button that is gone.
async function startEditing(): Promise<void> {
  nicknameStatus.reset();
  nickname.value = currentNickname.value;
  editing.value = true;
  await nextTick();
  nicknameInput.value?.focus();
  nicknameInput.value?.select();
}

async function stopEditing(): Promise<void> {
  editing.value = false;
  nicknameStatus.clearError();
  await nextTick();
  editButton.value?.$el.focus();
}

async function saveNickname(): Promise<void> {
  if (!nicknameChanged.value || nicknameBusy.value) return;
  nicknameStatus.saving();
  try {
    await props.changeNickname(nickname.value);
    currentNickname.value = nickname.value;
    await renameSavedIdentity(nickname.value);
    nicknameStatus.saved();
    await stopEditing();
  } catch (error) {
    nicknameStatus.failed(resolveText(errorText(error, text("err_OPERATION_FAILED"))));
  }
}

// The nickname is already changed on the server, so a storage hiccup here must not turn that into a failure.
async function renameSavedIdentity(label: string): Promise<void> {
  const id = savedIdentity.value?.id;
  if (!id) return;
  try {
    await manager.rename(id, label);
  } catch {
    /* the label keeps its old name */
  }
}

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
    const result = await manager.importIdentity(privateMaterial, currentNickname.value);
    if (!result.ok) throw new Error(result.code);
    savedId.value = result.identity.id;
  });
}

function copyUid(uid: string | undefined): void {
  if (!uid) return;
  navigator.clipboard?.writeText(uid).then(
    () => toast(t("uidCopiedToast")),
    () => toast({ title: t("uidCopyFailedToast"), variant: "danger" }),
  );
}
</script>
