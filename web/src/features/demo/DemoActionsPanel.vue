<template>
  <aside
    :class="[demoPanel, 'flex flex-col gap-2.25 max-demo-wide:col-span-full max-demo-wide:min-h-40 max-demo:mt-3']"
    :aria-label="t('simulationControls')"
  >
    <div class="mb-5 grid gap-1.25 max-demo-wide:mb-0.75">
      <span :class="demoKicker">{{ t("voice") }}</span
      ><strong class="text-lg text-fg">{{ t("simulationControls") }}</strong>
    </div>
    <Button variant="outline" class="justify-start max-demo-wide:w-fit" @click="emit('toggleSpeaking')"
      ><Icon name="mic" :size="17" /> {{ speakingId ? t("stopSpeaking") : t("simulateSpeaking") }}</Button
    ><Button variant="outline" class="justify-start max-demo-wide:w-fit" @click="emit('poke')"
      ><Icon name="bell" :size="17" /> {{ t("poke") }}</Button
    ><Button variant="outline" class="justify-start max-demo-wide:w-fit" @click="emit('reconnect')"
      ><Icon name="refresh" :size="17" /> {{ t("simulateReconnect") }}</Button
    >
    <div class="mt-2.5 flex gap-2 rounded-md bg-surface-0 p-2.75 text-2xs leading-normal text-fg-muted max-demo-wide:mt-1">
      <Icon name="shield" :size="16" /><span>{{ t("demoNote") }}</span>
    </div>
    <Separator class="mt-auto max-demo-wide:mt-0" />
    <div class="mt-1.5 flex items-center gap-2.25">
      <Avatar name="illusia" size="md" />
      <div class="min-w-0 flex-1">
        <strong class="block text-xs text-fg">{{ DEMO_USER_NAME }}</strong
        ><small class="mt-1 block text-2xs text-fg-muted">{{ t("you") }} · {{ t("ready") }}</small>
      </div>
      <span class="size-1.75 rounded-full bg-success"></span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import {} from "@/shared/lib/brand";
const DEMO_USER_NAME = "illusia";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Separator } from "@/shared/ui/separator";
import { useI18n } from "@/shared/i18n/useI18n";
import { demoKicker, demoPanel } from "./demoPanel";

defineProps<{ speakingId: string }>();
const emit = defineEmits<{ toggleSpeaking: []; poke: []; reconnect: [] }>();
const { t } = useI18n();
</script>
