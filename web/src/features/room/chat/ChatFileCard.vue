<template>
  <div role="group" :aria-label="t('fileCardLabel', { name: file.fileName })" class="space-y-1.5">
    <div class="flex min-w-0 items-center gap-2.5 rounded-md border border-current/25 bg-current/10 px-2.5 py-2">
      <Icon name="paperclip" :size="18" class="shrink-0" />
      <div class="min-w-0">
        <p class="font-semibold break-words">{{ file.fileName }}</p>
        <p class="text-sm opacity-80">{{ formatFileSize(file.fileSize) }} · {{ t("fileCardUnavailable") }}</p>
      </div>
    </div>
    <p v-if="file.description" class="break-words">{{ file.description }}</p>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize, type MytsFile } from "@/features/room/chat/mytsFile";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Icon } from "@/shared/ui/icon";

// MyTeamSpeak does not allow third-party clients to fetch the file, so only what the message itself carries is shown.
defineProps<{ file: MytsFile }>();

const { t } = useI18n();
</script>
