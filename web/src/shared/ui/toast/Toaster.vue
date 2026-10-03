<script setup lang="ts">
import { ToastAction, ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from "reka-ui";
import { cn } from "../../lib/cn";
import { useToast } from "../../composables/useToast";
import { Button } from "../button";
import { Icon } from "../icon";
import { statusIconName } from "../shared/status";
import { toastIconVariants, toastRootClass, toastViewportClass } from "./toast";

// Renders the toasts raised through useToast(). Mount it once, near the app
// root. A toast pauses its timer while hovered or focused, can be swiped
// away, and F8 moves focus to the stack. Danger toasts are announced
// assertively, the rest politely.
//
// `label` names the region and prefixes each announcement ("Notifications");
// the F8 hint is appended to the region name for you. Pass `label` and
// `dismissLabel` translated, the defaults are English.
//
// While a modal Dialog is open the toast still shows (its z-index is above the
// dialog overlay), but reka-ui marks everything outside the dialog aria-hidden
// and inert to the pointer: the toast is not announced and its buttons cannot
// be clicked until the dialog closes. Keep toasts raised from inside a dialog
// short and free of actions.
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
        <ToastDescription v-if="t.description" class="block text-[13px] leading-[18px] text-fg-muted">{{ t.description }}</ToastDescription>
      </div>
      <ToastAction v-if="t.action" as-child :alt-text="t.action.altText ?? t.action.label">
        <Button variant="outline" size="sm" class="shrink-0 self-center max-[740px]:order-last max-[740px]:ml-10 max-[740px]:h-11 max-[740px]:w-[calc(100%-2.5rem)]" @click="t.action.onClick()">{{ t.action.label }}</Button>
      </ToastAction>
      <ToastClose as-child>
        <Button variant="ghost" size="sm" icon-only class="-my-1 -mr-1.5 shrink-0 max-[740px]:h-11 max-[740px]:w-11" :aria-label="dismissLabel">
          <Icon name="close" :size="15" />
        </Button>
      </ToastClose>
    </ToastRoot>
    <ToastViewport :label="`${label} ({hotkey})`" :class="cn(toastViewportClass, props.class)" />
  </ToastProvider>
</template>
