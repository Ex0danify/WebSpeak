<script setup lang="ts">
import { computed, useId, useSlots } from "vue";
import { cn } from "../../lib/cn";
import { cardBodyVariants, cardVariants, type CardVariants } from "./card";

// A surface with a 1 px border and no shadow. The optional header holds a
// title (or the `header` slot) and an `actions` slot; `footer` sits below the
// body. Use `as="section"` for a landmark: it is then labelled by the title.
const props = withDefaults(
  defineProps<{
    title?: string;
    /** Element for the card itself. */
    as?: "div" | "section" | "article" | "li";
    /** Heading level of the title. */
    headingTag?: "h2" | "h3" | "h4";
    /** Drop the body padding, for lists and tables that run edge to edge. */
    flush?: boolean;
    /** Body padding when not `flush`: `md` (default), `dense`, `sm`, `lg` (shrinks on a phone) or `xl` (login box). */
    padding?: NonNullable<CardVariants["padding"]>;
    raised?: boolean;
    /** Layout of the body (a grid, a flex column); padding comes from `padding`. */
    bodyClass?: string;
    class?: string;
  }>(),
  { as: "div", headingTag: "h3", flush: false, padding: "md", raised: false },
);

const slots = useSlots();
const titleId = `card-title-${useId()}`;
const hasHeader = computed(() => Boolean(props.title || slots.header || slots.actions));
const labelled = computed(() => props.as === "section" && Boolean(props.title));
</script>

<template>
  <component
    :is="as"
    :aria-labelledby="labelled ? titleId : undefined"
    :class="cn(cardVariants({ raised }), props.class)"
  >
    <header v-if="hasHeader" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-5 py-3.5">
      <slot name="header">
        <component :is="headingTag" :id="titleId" class="m-0 min-w-0 break-words text-base font-semibold leading-snug">{{ title }}</component>
      </slot>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2"><slot name="actions" /></div>
    </header>
    <div :class="cn(cardBodyVariants({ padding: flush ? 'none' : padding }), bodyClass)"><slot /></div>
    <footer v-if="$slots.footer" class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
      <slot name="footer" />
    </footer>
  </component>
</template>
