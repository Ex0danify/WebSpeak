<template>
  <div :class="cn('flex items-center', frame[variant], props.class)">
    <span :class="cn('grid place-items-center rounded-lg bg-accent text-accent-fg shadow-sm', mark[variant])"
      ><Icon name="waveform" :size="iconSize[variant]"
    /></span>
    <div>
      <strong :class="cn('block tracking-brand', name[variant])">{{ APP_NAME }}</strong>
      <small v-if="variant !== 'bar'" class="mt-0.75 block text-caption text-fg-muted">{{ t("adminConsoleTitle") }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { APP_NAME } from "@/shared/lib/brand";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";

// `auth` is the centered mark of the sign-in screens, `sidebar` the one at the top of the nav and `bar` the small one in the top
// bar of a phone, where the nav is at the bottom.
const props = withDefaults(defineProps<{ variant?: "auth" | "sidebar" | "bar"; class?: string }>(), { variant: "auth" });

const { t } = useI18n();
const frame = { auth: "justify-center gap-3", sidebar: "gap-3 px-2 pb-7", bar: "gap-2" };
const mark = { auth: "size-10.5", sidebar: "size-10.5", bar: "size-8" };
const name = { auth: "text-xl", sidebar: "text-xl", bar: "text-md" };
const iconSize = { auth: 24, sidebar: 22, bar: 18 };
</script>
