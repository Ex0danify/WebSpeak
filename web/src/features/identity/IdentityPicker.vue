<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-end gap-2">
      <Field id="device-identity" :label="t('identityLabel')" class="flex-1">
        <Select v-model="selectValue">
          <option value="">{{ t("identityEphemeral") }}</option>
          <option v-for="identity in manager.identities.value" :key="identity.id" :value="identity.id">
            {{ identity.label || t("identityUnnamed") }}
          </option>
        </Select>
      </Field>
      <Button type="button" variant="soft" @click="dialogOpen = true">{{ t("identityManage") }}</Button>
    </div>

    <p v-if="mintHint" aria-live="polite" class="m-0 text-2xs leading-normal text-fg-muted">{{ mintHint }}</p>

    <IdentityManagerDialog v-model="dialogOpen" :manager="manager" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n.js";
import IdentityManagerDialog from "@/features/identity/IdentityManagerDialog.vue";
import type { useIdentityManager } from "@/features/identity/useIdentityManager.js";

const props = defineProps<{ manager: ReturnType<typeof useIdentityManager> }>();

const { t } = useI18n();
const dialogOpen = ref(false);

const selectValue = computed({
  get: () => props.manager.selectedId.value ?? "",
  set: (value) => void props.manager.select(value === "" ? undefined : String(value)),
});

const mintHint = computed(() => {
  const state = props.manager.mintState.value;
  if (state.phase === "minting") return t("identityMintProgress");
  if (state.phase === "queued") return state.ahead && state.ahead > 0 ? t("identityMintAhead", { count: state.ahead }) : t("identityMintQueued");
  return "";
});
</script>
