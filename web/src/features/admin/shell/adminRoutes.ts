import type { Component } from "vue";
import AdminDashboardPage from "@/features/admin/dashboard/AdminDashboardPage.vue";
import AdminDiagnosticsPage from "@/features/admin/diagnostics/AdminDiagnosticsPage.vue";
import AdminGatewayPage from "@/features/admin/gateway/AdminGatewayPage.vue";
import AdminUsersPage from "@/features/admin/users/AdminUsersPage.vue";
import type { MessageKey } from "@/shared/i18n/messageKeys";
import type { IconName } from "@/shared/ui/icon";

export interface AdminRoute {
  path: string;
  titleKey: MessageKey;
  icon: IconName;
  component: Component;
}

/** The pages of the signed-in console. The nav and the page shown come from this table, the first entry is home. */
export const adminRoutes: readonly AdminRoute[] = [
  { path: "/admin", titleKey: "dashboard", icon: "home", component: AdminDashboardPage },
  { path: "/admin/gateway", titleKey: "gateway", icon: "server", component: AdminGatewayPage },
  { path: "/admin/users", titleKey: "users", icon: "users", component: AdminUsersPage },
  { path: "/admin/diagnostics", titleKey: "diagnostics", icon: "activity", component: AdminDiagnosticsPage },
];

export function adminRouteTitle(route: AdminRoute, t: (key: MessageKey) => string): string {
  return t(route.titleKey);
}
