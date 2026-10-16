<script setup lang="ts">
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Icon, type IconName } from "@/shared/ui/icon";
import { bannerVariants, type BannerVariants } from "@/shared/ui/banner/banner";
import { statusIconName, statusTextClass } from "@/shared/ui/shared/status";

// A message that stays in the layout until the situation changes (reconnecting, degraded audio, a poke). Something that
// happened and can be forgotten is a Toast. It is a block, not floating, and takes the width of its container.

// `danger` is announced immediately (role="alert"), the others politely (role="status"). `icon` swaps the glyph, the variant
// still sets the color. `dismissible` shows an X that emits `dismiss`, the banner doesn't hide itself so the owner of the state
// decides.
const props = withDefaults(
  defineProps<{
    variant?: NonNullable<BannerVariants["variant"]>;
    title?: string;
    icon?: IconName;
    /** Floats over the page (a poke): adds a shadow. */
    floating?: boolean;
    dismissible?: boolean;
    dismissLabel?: string;
    class?: string;
  }>(),
  { variant: "info", floating: false, dismissible: false, dismissLabel: "Dismiss" },
);

defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div :role="variant === 'danger' ? 'alert' : 'status'" :class="cn(bannerVariants({ variant }), floating && 'shadow-lg', props.class)">
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
      class="-my-1 -mr-2 max-compact:h-11 max-compact:w-11"
      :aria-label="dismissLabel"
      @click="$emit('dismiss')"
    >
      <Icon name="close" :size="15" />
    </Button>
  </div>
</template>
