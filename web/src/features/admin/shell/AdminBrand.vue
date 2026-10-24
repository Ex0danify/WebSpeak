<template>
  <div :class="cn('flex items-center gap-3', frame[variant], props.class)">
    <span class="grid size-10.5 place-items-center rounded-lg bg-accent text-accent-fg shadow-sm"
      ><Icon name="waveform" :size="iconSize[variant]"
    /></span>
    <div>
      <strong class="block text-xl tracking-brand">{{ APP_NAME }}</strong>
      <small :class="cn('mt-0.75 block text-caption text-fg-muted', subtitle[variant])">{{ t("adminConsoleTitle") }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { APP_NAME } from "@/shared/lib/brand";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";

// `auth` is the centered mark of the sign-in screens, `sidebar` the one at the top of the nav (icon only on a phone).
const props = withDefaults(defineProps<{ variant?: "auth" | "sidebar"; class?: string }>(), { variant: "auth" });

const { t } = useI18n();
const frame = { auth: "justify-center", sidebar: "px-2 pb-7 max-desktop:p-0" };
const iconSize = { auth: 24, sidebar: 22 };
const subtitle = { auth: "", sidebar: "max-desktop:hidden" };
</script>
