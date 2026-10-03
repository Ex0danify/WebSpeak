<script setup lang="ts">
import { cn } from "../../lib/cn";
import { Button } from "../button";
import { Icon, type IconName } from "../icon";
import { bannerVariants, type BannerVariants } from "./banner";
import { statusIconName, statusTextClass } from "../shared/status";

// A message that stays in the layout until the situation changes: reconnecting,
// degraded audio, a poke. For something that happened and can be forgotten
// use a Toast. It is a block, not floating; put it where the content it
// concerns starts and it takes the width of its container.
//
//   <Banner variant="warning" title="Reconnecting">Trying again in 3 s.
//     <template #actions><Button size="sm" variant="outline">Retry now</Button></template>
//   </Banner>
//
// `danger` is announced immediately (role="alert"), the others politely
// (role="status"). Every variant carries an icon; `icon` swaps the glyph (a
// bell for a poke) and the variant still sets its color. With `dismissible` the X
// button emits `dismiss`; the banner does not hide itself, so the owner of
// the state decides. Pass `dismissLabel` translated, the default is English.
const props = withDefaults(
  defineProps<{
    variant?: NonNullable<BannerVariants["variant"]>;
    title?: string;
    icon?: IconName;
    dismissible?: boolean;
    dismissLabel?: string;
    class?: string;
  }>(),
  { variant: "info", dismissible: false, dismissLabel: "Dismiss" },
);

defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div :role="variant === 'danger' ? 'alert' : 'status'" :class="cn(bannerVariants({ variant }), props.class)">
    <Icon :name="icon ?? statusIconName[variant]" :size="18" :class="cn('mt-0.5 shrink-0', statusTextClass[variant])" />
    <div class="min-w-0 flex-1 basis-48 break-words">
      <p v-if="title" class="m-0 font-semibold">{{ title }}</p>
      <div :class="title ? 'text-fg-muted' : ''"><slot /></div>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2"><slot name="actions" /></div>
    <Button
      v-if="dismissible"
      variant="ghost"
      size="sm"
      icon-only
      class="-my-1 -mr-2 max-[740px]:h-11 max-[740px]:w-11"
      :aria-label="dismissLabel"
      @click="$emit('dismiss')"
    >
      <Icon name="close" :size="15" />
    </Button>
  </div>
</template>
