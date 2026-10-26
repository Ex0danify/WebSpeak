import type { Component } from "vue";
import AdminDashboardPage from "@/features/admin/dashboard/AdminDashboardPage.vue";
import AdminDiagnosticsPage from "@/features/admin/diagnostics/AdminDiagnosticsPage.vue";
import AdminGatewayPage from "@/features/admin/gateway/AdminGatewayPage.vue";
import AdminWebPage from "@/features/admin/web/AdminWebPage.vue";
import AdminUsersPage from "@/features/admin/users/AdminUsersPage.vue";
import InvitesView from "@/features/admin/users/invites/InvitesView.vue";
import SessionsView from "@/features/admin/users/sessions/SessionsView.vue";
import type { MessageKey } from "@/shared/i18n/messageKeys";
import type { IconName } from "@/shared/ui/icon";

export interface AdminRoute {
  path: string;
  titleKey: MessageKey;
  icon: IconName;
  component: Component;
  /** A sub-view has no entry in the nav. It names the page it belongs to, which stays marked in the nav. */
  parent?: string;
}

/** The pages of the signed-in console. The nav and the page shown come from this table, the first entry is home. Sub-views follow the pages. */
export const adminRoutes: readonly AdminRoute[] = [
  { path: "/admin", titleKey: "dashboard", icon: "home", component: AdminDashboardPage },
  { path: "/admin/gateway", titleKey: "gateway", icon: "server", component: AdminGatewayPage },
  { path: "/admin/web", titleKey: "web", icon: "globe", component: AdminWebPage },
  { path: "/admin/users", titleKey: "users", icon: "users", component: AdminUsersPage },
  { path: "/admin/diagnostics", titleKey: "diagnostics", icon: "activity", component: AdminDiagnosticsPage },
  { path: "/admin/users/invites", titleKey: "invites", icon: "users", component: InvitesView, parent: "/admin/users" },
  { path: "/admin/users/sessions", titleKey: "sessions", icon: "users", component: SessionsView, parent: "/admin/users" },
];

/** The pages the nav lists. */
export const adminNavRoutes = adminRoutes.filter((route) => !route.parent);

export function adminRouteTitle(route: AdminRoute, t: (key: MessageKey) => string): string {
  return t(route.titleKey);
}
