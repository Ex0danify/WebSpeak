<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, watch } from "vue";
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import { cn } from "../../lib/cn";
import { popoverContentClass } from "./popover";

// A floating panel anchored to its trigger, for content rather than actions (use Menu for those). Not modal, focus
// moves into the panel on open, Tab can leave it, Esc or an outside click closes it and focus returns to the trigger.

// `trigger="hover"` is for a control that keeps its own click action (a mute button). The panel opens while pointer or focus is
// on trigger or panel, Esc closes it until they leave, and focus never moves in (the panel follows the trigger in the DOM).
const props = withDefaults(
  defineProps<{
    label?: string;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    trigger?: "click" | "hover";
    class?: string;
  }>(),
  { side: "bottom", align: "center", trigger: "click" },
);

const open = defineModel<boolean>("open", { default: false });

const hover = computed(() => props.trigger === "hover");

// Hover mode: the panel is open while the pointer or focus is on the trigger or the panel. A short
// delay on the way out lets the pointer cross the gap between them and focus move from one to the other.
const CLOSE_DELAY_MS = 150;
let pointerIn = false;
let focusIn = false;
let dismissed = false;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function settle(): void {
  clearTimeout(closeTimer);
  if (pointerIn || focusIn) {
    if (!dismissed) open.value = true;
    return;
  }
  closeTimer = setTimeout(() => {
    dismissed = false;
    open.value = false;
  }, CLOSE_DELAY_MS);
}

// Esc stays in force while the pointer or focus that was there when it was pressed is still there.
function enter(kind: "pointer" | "focus"): void {
  if (!pointerIn && !focusIn) dismissed = false;
  if (kind === "pointer") pointerIn = true;
  else focusIn = true;
  settle();
}

function leave(kind: "pointer" | "focus"): void {
  if (kind === "pointer") pointerIn = false;
  else focusIn = false;
  settle();
}

const hoverEvents = {
  onPointerenter: () => enter("pointer"),
  onPointerleave: () => leave("pointer"),
  onFocusin: () => enter("focus"),
  onFocusout: () => leave("focus"),
};

function dismiss(): void {
  dismissed = true;
  open.value = false;
}

// Hover mode ignores outside interaction and focus changes, only the pointer and focus state above and Esc close it.
function keepOpen(event: Event): void {
  if (hover.value) event.preventDefault();
}

// reka-ui puts tabbable guard spans at the edges of the document while a panel is open. They don't matter in click mode,
// but in hover mode a Tab round stops on them (an empty stop with no ring).
watch(open, async (isOpen) => {
  if (!isOpen || !hover.value) return;
  await nextTick();
  document.querySelectorAll<HTMLElement>("[data-reka-focus-guard]").forEach((guard) => (guard.tabIndex = -1));
});

onBeforeUnmount(() => clearTimeout(closeTimer));

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function tabbableEdges(container: HTMLElement): [HTMLElement, HTMLElement] | [] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0,
  );
  return candidates.length ? [candidates[0], candidates[candidates.length - 1]] : [];
}

// reka-ui hardcodes `loop` to true on its FocusScope, so focus can never leave a popover, which breaks our "Tab can leave it".
// FocusScope listens on the panel, so a capture listener on an ancestor runs first and can swallow Tab at the edges so the
// browser moves focus.
function releaseTabAtEdges(event: KeyboardEvent): void {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const [first, last] = tabbableEdges(event.currentTarget as HTMLElement);
  if (!first) return;
  const active = document.activeElement;
  if ((event.shiftKey && active === first) || (!event.shiftKey && active === last)) event.stopPropagation();
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverAnchor v-if="hover" as-child v-bind="hoverEvents">
      <slot name="trigger" />
    </PopoverAnchor>
    <PopoverTrigger v-else as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal :disabled="hover">
      <div class="contents" @keydown.capture="releaseTabAtEdges">
        <PopoverContent
          :side="side"
          :align="align"
          :side-offset="8"
          :collision-padding="8"
          :aria-label="label"
          :class="cn(popoverContentClass, props.class)"
          v-bind="hover ? hoverEvents : {}"
          @open-auto-focus="keepOpen"
          @close-auto-focus="keepOpen"
          @interact-outside="keepOpen"
          @focus-outside="keepOpen"
          @escape-key-down="hover && dismiss()"
        >
          <slot :close="() => (open = false)" />
        </PopoverContent>
      </div>
    </PopoverPortal>
  </PopoverRoot>
</template>
