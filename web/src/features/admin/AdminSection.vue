<template>
  <Card as="article" :padding="padding" :flush="flush" :body-class="bodyClass" :class="props.class">
    <header :class="cn('flex items-start justify-between gap-3', headerClass)">
      <div>
        <h3 class="text-md font-bold">{{ title }}</h3>
        <p v-if="lead" :class="cn('mt-1.25 text-2xs text-fg-muted', leadLeading[leading])">{{ lead }}</p>
      </div>
      <slot name="action" />
    </header>
    <slot />
  </Card>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";
import { Card, type CardVariants } from "@/shared/ui/card";

// A card with a title, a lead line, an action on the right and the body below. It sets no size and no overflow: where a section
// sits and how it scrolls is up to the page, which passes `class` (the card), `bodyClass` and the lists' own class props.
// `leading` is the line height of the lead, `none` keeps what the card inherits.
const props = withDefaults(
  defineProps<{
    title: string;
    lead?: string;
    padding?: NonNullable<CardVariants["padding"]>;
    /** No body padding, for a card that pads itself. */
    flush?: boolean;
    leading?: "normal" | "tight" | "none";
    headerClass?: string;
    bodyClass?: string;
    class?: string;
  }>(),
  { padding: "sm", flush: false, leading: "normal" },
);

const leadLeading = { normal: "leading-normal", tight: "leading-tight", none: "" };
</script>
