import type { Component } from "vue";
import AdminOperationsPage from "@/features/admin/AdminOperationsPage.vue";
import AdminOverviewPage from "@/features/admin/AdminOverviewPage.vue";
import AdminServerPage from "@/features/admin/AdminServerPage.vue";
import type { MessageKey } from "@/shared/i18n/messageKeys";
import type { IconName } from "@/shared/ui/icon";

export interface AdminRoute {
  path: string;
  titleKey: MessageKey;
  icon: IconName;
  component: Component;
}

/** The pages of the signed-in console. The nav, the page title and the page shown all come from this table, the first entry is home. */
export const adminRoutes: readonly AdminRoute[] = [
  { path: "/admin", titleKey: "overview", icon: "activity", component: AdminOverviewPage },
  { path: "/admin/server", titleKey: "server", icon: "server", component: AdminServerPage },
  { path: "/admin/operations", titleKey: "operations", icon: "users", component: AdminOperationsPage },
];

export function adminRouteTitle(route: AdminRoute, t: (key: MessageKey) => string): string {
  return t(route.titleKey);
}
