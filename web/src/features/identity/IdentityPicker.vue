<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-end gap-2">
      <Field id="device-identity" :label="t('identityLabel')" class="flex-1">
        <ListSelect v-model="selectValue" :items="items">
          <template #value="{ item }">
            <span :class="{ italic: isEphemeral(item?.value) }">{{ item?.label ?? t("identityEphemeral") }}</span
            ><span v-if="isDefault(item?.value)" class="italic"> ({{ t("identityDefault") }})</span>
          </template>
          <template #item="{ item }">
            <span class="flex items-center gap-1.5">
              <span
                ><span :class="{ italic: isEphemeral(item.value) }">{{ item.label }}</span
                ><span v-if="isDefault(item.value)" class="italic"> ({{ t("identityDefault") }})</span></span
              >
              <Icon v-if="isDefault(item.value)" name="star" :size="13" class="shrink-0 fill-current text-accent" />
            </span>
          </template>
        </ListSelect>
      </Field>
      <Button type="button" variant="outline" @click="dialogOpen = true">{{ t("identityManage") }}</Button>
    </div>

    <p v-if="mintHint" aria-live="polite" class="m-0 text-2xs leading-normal text-fg-muted">{{ mintHint }}</p>
    <p v-if="identityInUse" aria-live="polite" class="m-0 text-2xs leading-normal text-warning">{{ t("identityConcurrentWarning") }}</p>

    <IdentityManagerDialog v-model="dialogOpen" :manager="manager" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { ListSelect, type ListSelectItem } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n.js";
import IdentityManagerDialog from "@/features/identity/IdentityManagerDialog.vue";
import { checkIdentityStatus } from "@/features/identity/identityMintClient.js";
import type { useIdentityManager } from "@/features/identity/useIdentityManager.js";

const props = defineProps<{ manager: ReturnType<typeof useIdentityManager>; target?: string; serverId?: string }>();

const { t } = useI18n();
const dialogOpen = ref(false);

// Whether the selected identity is already live on this target in another page. A debounced, abortable
// lookup so it survives rapid target typing and identity switches; it only drives the hint, never a gate.
const identityInUse = ref(false);
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let statusAbort: AbortController | undefined;

watch(
  [() => props.manager.selectedId.value, () => props.target, () => props.serverId, () => props.manager.identities.value],
  ([id, target, serverId]) => {
    identityInUse.value = false;
    statusAbort?.abort();
    clearTimeout(statusTimer);
    const material = id ? props.manager.identities.value.find((entry) => entry.id === id)?.privateMaterial : undefined;
    if (!material) return;
    statusTimer = setTimeout(() => {
      statusAbort = new AbortController();
      void checkIdentityStatus(material, target ?? "", statusAbort.signal, serverId ?? "").then((inUse) => {
        identityInUse.value = inUse;
      });
    }, 400);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  statusAbort?.abort();
  clearTimeout(statusTimer);
});

// reka's Select treats an undefined value as the placeholder, so the ephemeral choice carries a sentinel
// value here and maps back to `undefined` at the manager boundary.
const EPHEMERAL = "\0ephemeral";
const isEphemeral = (value: string | undefined): boolean => value === EPHEMERAL;
const isDefault = (value: string | undefined): boolean => value !== undefined && value === props.manager.defaultId.value;

const items = computed<ListSelectItem[]>(() => [
  { value: EPHEMERAL, label: t("identityEphemeral") },
  ...props.manager.identities.value.map((identity) => ({ value: identity.id, label: identity.label || t("identityUnnamed") })),
]);

const selectValue = computed({
  get: () => props.manager.selectedId.value ?? EPHEMERAL,
  set: (value) => void props.manager.select(value === EPHEMERAL ? undefined : value),
});

const mintHint = computed(() => {
  const state = props.manager.mintState.value;
  if (state.phase === "minting") return t("identityMintProgress");
  if (state.phase === "queued")
    return state.ahead && state.ahead > 0 ? t("identityMintAhead", { count: state.ahead }) : t("identityMintQueued");
  return "";
});
</script>
