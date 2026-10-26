<template>
  <Card as="article" padding="lg" body-class="grid content-start gap-3" :class="props.class">
    <header class="flex items-start justify-between gap-3">
      <div>
        <div v-if="status" class="flex flex-wrap items-center gap-x-3">
          <h2 class="text-md font-bold">{{ title }}</h2>
          <SaveStatus :status="status" :quiet="statusQuiet" />
        </div>
        <h2 v-else class="text-md font-bold">{{ title }}</h2>
        <p v-if="lead" class="mt-1.25 text-2xs leading-normal text-fg-muted">{{ lead }}</p>
      </div>
      <slot name="action" />
    </header>
    <slot />
    <Banner v-if="status?.error && !offline" variant="danger">{{ status.error }}</Banner>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Banner } from "@/shared/ui/banner";
import { Card } from "@/shared/ui/card";
import type { SaveStatus as SaveStatusState } from "@/features/admin/core/saveStatus";
import { useAdminGatewayStore } from "@/features/admin/core/adminGateway";
import SaveStatus from "@/features/admin/ui/SaveStatus.vue";

// A card with a title, a lead line, an action on the right and the body below. It sets no size and no overflow: where a section
// sits is up to the page, which passes `class`, and a list that can grow without end is a ScrollRegion.
const props = defineProps<{
  title: string;
  lead?: string;
  /** What the last autosave of this section says: shown next to the title, and its error below the body. */
  status?: SaveStatusState;
  /** The controls of the section mark their own saves: the status is then only announced, not shown. */
  statusQuiet?: boolean;
  class?: string;
}>();

// The top bar already says the gateway is gone, so a save that failed for it shows no message of its own.
const { offline } = storeToRefs(useAdminGatewayStore());
</script>
