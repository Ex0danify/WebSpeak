<template>
  <aside :class="sidebarFrame">
    <AdminBrand variant="sidebar" class="max-desktop:hidden" />
    <nav :aria-label="t('adminNavigation')" :class="navFrame">
      <RouterLink
        v-for="route in adminNavRoutes"
        :key="route.path"
        :to="route.path"
        :class="navLink"
        :aria-current="route.path === activePath ? (route.path === current.path ? 'page' : 'true') : undefined"
      >
        <Icon :name="route.icon" :size="18" /><span>{{ adminRouteTitle(route, t) }}</span></RouterLink
      >
    </nav>
    <div class="mt-auto grid gap-1 border-t border-line pt-5 max-desktop:hidden">
      <Button as="a" variant="ghost" :class="sidebarActionClass" href="/" target="_blank"
        ><Icon name="share" :size="16" />{{ t("openGuest") }}</Button
      >
      <Button variant="ghost" :class="sidebarActionClass" @click="logout()"><Icon name="door" :size="16" />{{ t("logout") }}</Button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import AdminBrand from "@/features/admin/shell/AdminBrand.vue";
import { sidebarFrame } from "@/features/admin/shell/adminChrome";
import { adminNavRoutes, adminRouteTitle } from "@/features/admin/shell/adminRoutes";
import { useAdminRoute } from "@/features/admin/shell/useAdminRoute";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { useI18n } from "@/shared/i18n/useI18n";

const { logout } = useAdminSessionStore();
const { current } = useAdminRoute();
// Inside a sub-view the page it belongs to stays marked.
const activePath = computed(() => current.value.parent ?? current.value.path);
const { t } = useI18n();

// Look of the footer actions (Open guest page, Log out): quiet, full width, left aligned.
const sidebarActionClass = "h-auto justify-start gap-2.5 rounded-md px-3 py-2.75 text-xs font-bold text-fg-muted";
// A list on desktop, four equal tabs on a phone. The router marks the current page with aria-current="page": a tint and the
// accent color, and on a phone also a bar on the top edge, so the page is not shown by color alone.
const navFrame = "grid gap-1.5 max-desktop:w-full max-desktop:grid-cols-4 max-desktop:gap-0";
const navLink =
  "flex items-center gap-2.5 rounded-md px-3 py-2.75 text-xs font-bold text-fg-muted no-underline aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent " +
  "max-desktop:min-h-14 max-desktop:flex-col max-desktop:justify-center max-desktop:gap-1 max-desktop:rounded-none max-desktop:border-t-2 max-desktop:border-transparent max-desktop:px-1 max-desktop:py-1.5 max-desktop:text-2xs " +
  "max-desktop:aria-[current=page]:border-accent max-desktop:aria-[current=true]:border-accent";
</script>
