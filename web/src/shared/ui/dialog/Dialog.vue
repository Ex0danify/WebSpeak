<script setup lang="ts">
import { computed, useSlots } from "vue";
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { cn } from "../../lib/cn";
import { Button } from "../button";
import { Icon } from "../icon";
import { dialogOverlayClass, dialogPanelVariants, dialogSheetOverlayClass, dialogSheetPanelClass, type DialogVariants } from "./dialog";

// Modal dialog on reka-ui, which brings the focus trap, Esc, outside press, scroll lock, aria-hidden behind it and focus
// return. Content renders only while open, so a form inside starts fresh each time.

// Focus lands on the first focusable element in the body (or the one marked `autofocus`), else on the close button. Name it
// with `title` or the `title` slot, or pass `label` without a visible title. Pass `closeLabel` translated, the default is
// English.
const props = withDefaults(
  defineProps<{
    title?: string;
    /** Accessible name when there is no visible title. */
    label?: string;
    /** Supporting text under the title, also used as the accessible description. */
    description?: string;
    size?: DialogVariants["size"];
    /** `bottom` is a full-width sheet pinned to the bottom edge, for mobile. It has no header. */
    placement?: "center" | "bottom";
    closeLabel?: string;
    /** When false, Esc, the backdrop and the X button do nothing, so the footer must close it. */
    dismissible?: boolean;
    class?: string;
  }>(),
  { placement: "center", closeLabel: "Close", dismissible: true },
);

const open = defineModel<boolean>({ default: false });

const slots = useSlots();
const hasTitle = computed(() => Boolean(props.title || slots.title));
const sheet = computed(() => props.placement === "bottom");
const hasHeader = computed(() => hasTitle.value || (props.dismissible && !sheet.value));

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Reka would focus the first tabbable element, which is the X button. Prefer
// the body's first control unless the caller marked one with `autofocus`.
function onOpenAutoFocus(event: Event) {
  event.preventDefault();
  const panel = event.target as HTMLElement;
  const target =
    panel.querySelector<HTMLElement>("[autofocus]") ??
    panel.querySelector<HTMLElement>("[data-dialog-body]")?.querySelector<HTMLElement>(FOCUSABLE) ??
    panel.querySelector<HTMLElement>("[data-dialog-close]") ??
    panel;
  target.focus({ preventScroll: true });
}

// A locked dialog ignores Esc and outside presses. Reka only starts an outside press when it begins there, so selecting
// text or dragging a slider onto the backdrop does not close it.
function keepOpen(event: Event) {
  if (!props.dismissible) event.preventDefault();
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay :class="cn(dialogOverlayClass, sheet && dialogSheetOverlayClass)">
        <DialogContent
          v-bind="description ? {} : { 'aria-describedby': undefined }"
          :class="cn(dialogPanelVariants({ size }), sheet && dialogSheetPanelClass, 'outline-none', props.class)"
          @open-auto-focus="onOpenAutoFocus"
          @escape-key-down="keepOpen"
          @pointer-down-outside="keepOpen"
          @interact-outside="keepOpen"
        >
          <header v-if="hasHeader" class="flex shrink-0 items-start gap-3 px-6 pt-5 pb-3 max-compact:px-4">
            <div class="min-w-0 flex-1">
              <DialogTitle v-if="hasTitle" class="m-0 text-lg leading-snug font-semibold break-words text-fg">
                <slot name="title">{{ title }}</slot>
              </DialogTitle>
              <DialogDescription v-if="description" class="m-0 mt-1 text-sm break-words text-fg-muted">{{ description }}</DialogDescription>
            </div>
            <Button
              v-if="dismissible && !sheet"
              data-dialog-close
              variant="ghost"
              icon-only
              class="-mt-1 -mr-2 shrink-0 max-compact:size-11"
              :aria-label="closeLabel"
              @click="open = false"
            >
              <Icon name="close" :size="18" />
            </Button>
          </header>
          <!-- Reka names the dialog from its title, so a `label` is rendered as a hidden one. -->
          <DialogTitle v-if="!hasTitle" class="sr-only">{{ label }}</DialogTitle>
          <div data-dialog-body class="min-h-0 flex-1 overflow-y-auto px-6 py-3 max-compact:px-4">
            <slot />
          </div>
          <footer
            v-if="slots.footer"
            class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4 max-compact:px-4"
          >
            <slot name="footer" />
          </footer>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
