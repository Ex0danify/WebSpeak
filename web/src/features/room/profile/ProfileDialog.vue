<template>
  <Dialog v-model="open" size="sm" :title="t('profileMenu')" :close-label="t('close')">
    <template #footer
      ><Button @click="open = false">{{ t("done") }}</Button></template
    >
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useI18n } from "@/shared/i18n/useI18n.js";

const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
</script>
