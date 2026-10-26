<template>
  <section :class="cn(adminContainer, 'flex flex-col gap-4 pt-6 pb-8')">
    <AdminPageHeader :title="title" :lead="lead">
      <slot name="action" />
    </AdminPageHeader>
    <slot />
  </section>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";
import AdminPageHeader from "@/features/admin/ui/AdminPageHeader.vue";
import { adminContainer } from "@/features/admin/ui/adminPage";

// A page of the console: its one h1 with the lead and an action on the right, then the cards one under the other. The page
// scrolls as a whole, so a page that needs two columns arranges them itself.
defineProps<{ title: string; lead?: string }>();
</script>
