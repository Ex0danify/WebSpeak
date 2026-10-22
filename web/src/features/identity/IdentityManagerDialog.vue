<template>
  <Dialog v-model="open" size="md" :title="t('identityManagerTitle')" :description="t('identityManagerDescription')" :close-label="t('close')">
    <div class="flex flex-col gap-4">
      <!-- Saved identities -->
      <p v-if="manager.identities.value.length === 0" class="m-0 text-sm text-fg-muted">{{ t("identityEmpty") }}</p>
      <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="identity in manager.identities.value" :key="identity.id" class="rounded-lg border border-line p-3">
          <div v-if="renamingId === identity.id" class="flex flex-wrap items-end gap-2">
            <Field :id="`rename-${identity.id}`" :label="t('identityRenameTitle')" class="flex-1">
              <Input v-model.trim="renameLabel" maxlength="40" autofocus @keyup.enter="confirmRename(identity.id)" />
            </Field>
            <Button type="button" size="sm" @click="confirmRename(identity.id)">{{ t("identitySave") }}</Button>
            <Button type="button" size="sm" variant="ghost" @click="renamingId = null">{{ t("identityCancel") }}</Button>
          </div>
          <div v-else class="flex flex-wrap items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate font-medium text-fg">{{ identity.label || t("identityUnnamed") }}</p>
              <p class="m-0 text-2xs text-fg-muted">{{ t("identityCreatedOn", { date: formatDate(identity.createdAt) }) }}</p>
            </div>
            <Button type="button" size="sm" variant="soft" @click="startRename(identity)">{{ t("identityRename") }}</Button>
            <Button type="button" size="sm" variant="soft" @click="exportIdentity(identity.id)">{{ t("identityExport") }}</Button>
            <Button
              type="button"
              size="sm"
              :variant="deletingId === identity.id ? 'danger' : 'ghost'"
              @click="deletingId === identity.id ? confirmDelete(identity.id) : (deletingId = identity.id)"
              >{{ t("identityDelete") }}</Button
            >
          </div>
          <p v-if="deletingId === identity.id && renamingId !== identity.id" role="alert" class="mt-2 mb-0 text-2xs leading-normal text-danger">
            {{ t("identityDeleteConfirm") }}
          </p>
        </li>
      </ul>

      <Banner variant="warning">{{ t("identityExportWarning") }}</Banner>

      <!-- Create -->
      <section class="flex flex-col gap-2 border-t border-line pt-4">
        <h3 class="m-0 text-sm font-semibold text-fg">{{ t("identityNewHeading") }}</h3>
        <div class="flex flex-wrap items-end gap-2">
          <Field id="new-identity-name" :label="t('identityNameLabel')" class="flex-1">
            <Input v-model.trim="newLabel" maxlength="40" :placeholder="t('identityNamePlaceholder')" :disabled="creating" />
          </Field>
          <Button type="button" :loading="creating" :disabled="creating" @click="create">{{ creating ? t("identityCreating") : t("identityCreate") }}</Button>
          <Button v-if="creating" type="button" variant="ghost" @click="cancelCreate">{{ t("identityCancel") }}</Button>
        </div>
        <p v-if="mintHint" aria-live="polite" class="m-0 text-2xs text-fg-muted">{{ mintHint }}</p>
      </section>

      <!-- Import -->
      <section class="flex flex-col gap-2 border-t border-line pt-4">
        <h3 class="m-0 text-sm font-semibold text-fg">{{ t("identityImportHeading") }}</h3>
        <div>
          <Button type="button" variant="soft" @click="fileInput?.click()">{{ t("identityImport") }}</Button>
          <input ref="fileInput" type="file" accept=".json,application/json" class="sr-only" @change="importFile" />
        </div>
        <p v-if="importError" role="alert" class="m-0 text-2xs text-danger">{{ importError }}</p>
      </section>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { toast } from "@/shared/composables/useToast.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { StoredIdentity } from "@/shared/services/localPersistence.js";
import type { useIdentityManager } from "@/features/identity/useIdentityManager.js";
import type { MessageKey } from "@/shared/i18n/messageKeys.js";

const props = defineProps<{ manager: ReturnType<typeof useIdentityManager> }>();
const open = defineModel<boolean>({ required: true });

const { t } = useI18n();

const newLabel = ref("");
const renamingId = ref<string | null>(null);
const renameLabel = ref("");
const deletingId = ref<string | null>(null);
const importError = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
let createAbort: AbortController | null = null;

const creating = computed(() => ["queued", "minting"].includes(props.manager.mintState.value.phase));

const mintHint = computed(() => {
  const state = props.manager.mintState.value;
  if (state.phase === "minting") return t("identityMintProgress");
  if (state.phase === "queued") return state.ahead && state.ahead > 0 ? t("identityMintAhead", { count: state.ahead }) : t("identityMintQueued");
  return "";
});

const ERROR_KEYS: Record<string, MessageKey> = {
  MINT_BUSY: "identityErrorBusy",
  LEVEL_TOO_HIGH: "identityErrorLevelTooHigh",
  NOT_INITIALIZED: "identityErrorNotReady",
  INVALID_IDENTITY: "identityImportInvalid",
  SAVE_FAILED: "identityErrorSave",
};

function errorMessage(code: string): string {
  return t(ERROR_KEYS[code] ?? "identityErrorFailed");
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

async function create(): Promise<void> {
  createAbort = new AbortController();
  const result = await props.manager.create({ label: newLabel.value || undefined, signal: createAbort.signal });
  createAbort = null;
  if (result.ok) {
    newLabel.value = "";
    toast(t("identityCreatedToast"));
  } else {
    toast({ title: errorMessage(result.code), variant: "danger" });
  }
}

function cancelCreate(): void {
  createAbort?.abort();
}

function startRename(identity: StoredIdentity): void {
  renamingId.value = identity.id;
  renameLabel.value = identity.label ?? "";
  deletingId.value = null;
}

async function confirmRename(id: string): Promise<void> {
  await props.manager.rename(id, renameLabel.value);
  renamingId.value = null;
  toast(t("identityRenamedToast"));
}

async function confirmDelete(id: string): Promise<void> {
  await props.manager.remove(id);
  deletingId.value = null;
  toast(t("identityDeletedToast"));
}

function exportIdentity(id: string): void {
  const exported = props.manager.exportIdentity(id);
  if (!exported) return;
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(exported.label || "identity").replace(/[^\w.-]+/g, "-")}.webspeak-identity.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast(t("identityExportedToast"));
}

async function importFile(event: Event): Promise<void> {
  importError.value = "";
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  let material: string;
  let label: string | undefined;
  try {
    const parsed = JSON.parse(await file.text()) as { privateMaterial?: unknown; label?: unknown };
    if (typeof parsed.privateMaterial !== "string") throw new Error("missing material");
    material = parsed.privateMaterial;
    label = typeof parsed.label === "string" ? parsed.label : undefined;
  } catch {
    importError.value = t("identityImportInvalid");
    return;
  }
  const result = await props.manager.importIdentity(material, label);
  if (result.ok) toast(t("identityImportedToast"));
  else importError.value = errorMessage(result.code);
}
</script>
