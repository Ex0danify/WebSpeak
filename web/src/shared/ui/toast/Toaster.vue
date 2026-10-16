<script setup lang="ts">
import { ToastAction, ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { useToast } from "@/shared/composables/useToast";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { statusIconName } from "@/shared/ui/shared/status";
import { toastIconVariants, toastRootClass, toastViewportClass } from "@/shared/ui/toast/toast";

// Renders the toasts raised through useToast(), mount it once near the app root. A toast pauses its timer while hovered or
// focused, can be swiped away, and F8 moves focus to the stack. Danger toasts are announced assertively, the rest politely.

// A modal Dialog keeps toasts visible (higher z-index), but reka-ui marks everything outside it aria-hidden and inert, so they
// are not announced and their buttons cannot be clicked until it closes. Keep toasts raised from inside a dialog short and free
// of actions.
const props = withDefaults(defineProps<{ label?: string; dismissLabel?: string; class?: string }>(), {
  label: "Notifications",
  dismissLabel: "Dismiss",
});

const { toasts, dismiss } = useToast();
</script>

<template>
  <ToastProvider :label="label" swipe-direction="right">
    <ToastRoot
      v-for="t in toasts"
      :key="t.id"
      :open="true"
      :type="t.variant === 'danger' ? 'foreground' : 'background'"
      :duration="t.duration"
      :class="toastRootClass"
      @update:open="(open: boolean) => !open && dismiss(t.id)"
    >
      <span :class="toastIconVariants({ variant: t.variant })"><Icon :name="statusIconName[t.variant]" :size="16" /></span>
      <div class="min-w-0 flex-1 basis-40 break-words">
        <ToastTitle class="block font-semibold">{{ t.title }}</ToastTitle>
        <ToastDescription v-if="t.description" class="block text-ui leading-[18px] text-fg-muted">{{ t.description }}</ToastDescription>
      </div>
      <ToastAction v-if="t.action" as-child :alt-text="t.action.altText ?? t.action.label">
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 self-center max-compact:order-last max-compact:ml-10 max-compact:h-11 max-compact:w-[calc(100%-2.5rem)]"
          @click="t.action.onClick()"
          >{{ t.action.label }}</Button
        >
      </ToastAction>
      <ToastClose as-child>
        <Button
          variant="ghost"
          size="sm"
          icon-only
          class="-my-1 -mr-1.5 shrink-0 max-compact:h-11 max-compact:w-11"
          :aria-label="dismissLabel"
        >
          <Icon name="close" :size="15" />
        </Button>
      </ToastClose>
    </ToastRoot>
    <ToastViewport :label="`${label} ({hotkey})`" :class="cn(toastViewportClass, props.class)" />
  </ToastProvider>
</template>
