<template>
  <section :class="cn(adminContainer, 'flex flex-col gap-4 pt-6 pb-8')">
    <RouterLink
      v-if="backTo"
      :to="backTo"
      class="-mb-2 inline-flex w-fit items-center gap-1 text-caption font-bold text-accent no-underline"
      ><Icon name="chevron-right" :size="16" class="rotate-180" />{{ backLabel }}</RouterLink
    >
    <AdminPageHeader :title="title" :lead="lead">
      <slot name="action" />
    </AdminPageHeader>
    <slot />
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import AdminPageHeader from "@/features/admin/ui/AdminPageHeader.vue";
import { adminContainer } from "@/features/admin/ui/adminPage";

// A page of the console: its one h1 with the lead and an action on the right, then the cards one under the other. The page
// scrolls as a whole, so a page that needs two columns arranges them itself.
// A sub-view of a page names that page in `backTo` and `backLabel`, so it is one link back.
defineProps<{ title: string; lead?: string; backTo?: string; backLabel?: string }>();
</script>
