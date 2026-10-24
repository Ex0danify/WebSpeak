<template>
  <Card as="article" :padding="padding" :flush="flush" :body-class="bodyClass" :class="props.class">
    <header :class="cn('flex items-start justify-between gap-3', headerClass)">
      <div>
        <div v-if="status" class="flex flex-wrap items-center gap-x-3">
          <h3 class="text-md font-bold">{{ title }}</h3>
          <SaveStatus :status="status" :quiet="statusQuiet" />
        </div>
        <h3 v-else class="text-md font-bold">{{ title }}</h3>
        <p v-if="lead" :class="cn('mt-1.25 text-2xs text-fg-muted', leadLeading[leading])">{{ lead }}</p>
      </div>
      <slot name="action" />
    </header>
    <slot />
    <Banner v-if="status?.error" variant="danger">{{ status.error }}</Banner>
  </Card>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";
import { Banner } from "@/shared/ui/banner";
import { Card, type CardVariants } from "@/shared/ui/card";
import type { SaveStatus as SaveStatusState } from "@/features/admin/core/saveStatus";
import SaveStatus from "@/features/admin/ui/SaveStatus.vue";

// A card with a title, a lead line, an action on the right and the body below. It sets no size and no overflow: where a section
// sits and how it scrolls is up to the page, which passes `class` (the card), `bodyClass` and the lists' own class props.
// `leading` is the line height of the lead, `none` keeps what the card inherits.
const props = withDefaults(
  defineProps<{
    title: string;
    lead?: string;
    /** What the last autosave of this section says: shown next to the title, and its error below the body. */
    status?: SaveStatusState;
    /** The controls of the section mark their own saves: the status is then only announced, not shown. */
    statusQuiet?: boolean;
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
