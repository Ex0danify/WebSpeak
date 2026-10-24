<template>
  <aside :class="sidebarFrame">
    <AdminBrand variant="sidebar" />
    <nav class="grid gap-1.5 max-desktop:ml-auto max-desktop:flex">
      <RouterLink v-for="route in adminRoutes" :key="route.path" :to="route.path" :class="navLink"
        ><Icon :name="route.icon" :size="18" /><span class="max-desktop:sr-only">{{ adminRouteTitle(route, t) }}</span></RouterLink
      >
    </nav>
    <div
      class="mt-auto grid gap-1 border-t border-line pt-5 max-desktop:mt-0 max-desktop:ml-2 max-desktop:flex max-desktop:border-t-0 max-desktop:p-0"
    >
      <Button as="a" variant="ghost" :class="sidebarActionClass + ' max-desktop:hidden'" href="/" target="_blank"
        ><Icon name="share" :size="16" />{{ t("openGuest") }}</Button
      >
      <Button variant="ghost" :class="sidebarActionClass" :aria-label="t('logout')" @click="logout()"
        ><Icon name="door" :size="16" /><span class="max-desktop:sr-only">{{ t("logout") }}</span></Button
      >
    </div>
  </aside>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import AdminBrand from "@/features/admin/AdminBrand.vue";
import { sidebarFrame } from "@/features/admin/adminChrome";
import { adminRouteTitle, adminRoutes } from "@/features/admin/adminRoutes";
import { useAdminSessionStore } from "@/features/admin/adminSession";
import { useI18n } from "@/shared/i18n/useI18n";

const { logout } = useAdminSessionStore();
const { t } = useI18n();

// Look of the footer actions (Open guest page, Log out): quiet, full width, left aligned.
const sidebarActionClass = "h-auto justify-start gap-2.5 rounded-md px-3 py-2.75 text-xs font-bold text-fg-muted";
// The router marks the current page with aria-current="page".
const navLink =
  "flex items-center gap-2.5 rounded-md px-3 py-2.75 text-xs font-bold text-fg-muted no-underline aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent max-desktop:[&_.ui-icon]:size-5";
</script>
