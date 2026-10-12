<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "../../lib/cn";
import { buttonVariants, type ButtonVariants } from "./button";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants["variant"];
    size?: ButtonVariants["size"];
    /** Look of the pressed state: `danger` (default, mute and deafen), `accent` (a feature that is on) or `none`. */
    pressedTone?: ButtonVariants["pressedTone"];
    /** Square icon button on a phone; hide the label there. */
    squareOnPhone?: boolean;
    type?: "button" | "submit" | "reset";
    /** Render a link (`<a>`); pass `href` as a normal attribute. */
    as?: "button" | "a";
    /** Square, text-free button. Give it an `aria-label`. */
    iconOnly?: boolean;
    /** Shows a spinner and ignores activation. The label stays for screen readers. */
    loading?: boolean;
    /** Toggle state, rendered as `aria-pressed`. Leave undefined for a plain button. */
    pressed?: boolean;
    disabled?: boolean;
    class?: string;
  }>(),
  { type: "button", as: "button", iconOnly: false, loading: false, pressed: undefined, disabled: false },
);

const attrs = useAttrs();
if (import.meta.env.DEV && props.iconOnly && !attrs["aria-label"] && !attrs["aria-labelledby"]) {
  console.warn("[Button] icon-only buttons need an aria-label");
}

const classes = computed(() =>
  cn(
    buttonVariants({
      variant: props.variant,
      size: props.size,
      iconOnly: props.iconOnly,
      pressedTone: props.pressedTone,
      squareOnPhone: props.squareOnPhone,
    }),
    props.loading && "pointer-events-none",
    props.class,
  ),
);

const isLink = computed(() => props.as === "a");
const ariaPressed = computed(() => (props.pressed === undefined ? undefined : String(props.pressed)));

// Capture phase and immediate stop so a parent's own @click never fires while loading.
function onClickCapture(event: MouseEvent) {
  if (!props.loading && !(isLink.value && props.disabled)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
</script>

<template>
  <component
    :is="as"
    :type="isLink ? undefined : type"
    :disabled="isLink ? undefined : disabled"
    :aria-disabled="isLink && disabled ? 'true' : undefined"
    :tabindex="isLink && disabled ? -1 : undefined"
    :aria-pressed="ariaPressed"
    :aria-busy="loading ? 'true' : undefined"
    :class="classes"
    @click.capture="onClickCapture"
  >
    <svg
      v-if="loading"
      class="size-4 shrink-0 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
    <slot v-if="!(loading && iconOnly)" />
  </component>
</template>
