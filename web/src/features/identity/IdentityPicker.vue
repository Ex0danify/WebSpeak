<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-end gap-2">
      <Field id="device-identity" :label="t('identityLabel')" class="flex-1">
        <Select v-model="selectValue">
          <option value="" class="italic">{{ t("identityEphemeral") }}</option>
          <option
            v-for="identity in manager.identities.value"
            :key="identity.id"
            :value="identity.id"
            :class="{ italic: identity.id === manager.defaultId.value }"
          >
            {{ identity.label || t("identityUnnamed") }}{{ identity.id === manager.defaultId.value ? ` (${t("identityDefault")})` : "" }}
          </option>
        </Select>
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
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n.js";
import IdentityManagerDialog from "@/features/identity/IdentityManagerDialog.vue";
import { checkIdentityStatus } from "@/features/identity/identityMintClient.js";
import type { useIdentityManager } from "@/features/identity/useIdentityManager.js";

const props = defineProps<{ manager: ReturnType<typeof useIdentityManager>; target?: string }>();

const { t } = useI18n();
const dialogOpen = ref(false);

// Whether the selected identity is already live on this target in another page. A debounced, abortable
// lookup so it survives rapid target typing and identity switches; it only drives the hint, never a gate.
const identityInUse = ref(false);
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let statusAbort: AbortController | undefined;

watch(
  [() => props.manager.selectedId.value, () => props.target, () => props.manager.identities.value],
  ([id, target]) => {
    identityInUse.value = false;
    statusAbort?.abort();
    clearTimeout(statusTimer);
    const material = id ? props.manager.identities.value.find((entry) => entry.id === id)?.privateMaterial : undefined;
    if (!material) return;
    statusTimer = setTimeout(() => {
      statusAbort = new AbortController();
      void checkIdentityStatus(material, target ?? "", statusAbort.signal).then((inUse) => {
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

const selectValue = computed({
  get: () => props.manager.selectedId.value ?? "",
  set: (value) => void props.manager.select(value === "" ? undefined : String(value)),
});

const mintHint = computed(() => {
  const state = props.manager.mintState.value;
  if (state.phase === "minting") return t("identityMintProgress");
  if (state.phase === "queued")
    return state.ahead && state.ahead > 0 ? t("identityMintAhead", { count: state.ahead }) : t("identityMintQueued");
  return "";
});
</script>
