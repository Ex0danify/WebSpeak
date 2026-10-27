import { provideAdminSiblings } from "@/features/admin/core/adminSiblings";
import { useAdminGatewayStore } from "@/features/admin/core/adminGateway";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import { useAdminEventLogStore } from "@/features/admin/events/adminEventLog";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { useAdminServerDialogStore } from "@/features/admin/gateway/adminServerDialog";
import { useAdminServerOrderStore } from "@/features/admin/gateway/adminServerOrder";
import { useAdminServersStore } from "@/features/admin/gateway/adminServers";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { useAdminConnectionsStore } from "@/features/admin/users/connections/adminConnections";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";
import { useAdminUsersStore } from "@/features/admin/users/adminUsers";

/** Wires the stores to each other. Call it once before the console is used; stores are resolved when a call happens. */
export function registerAdminStores(): void {
  provideAdminSiblings({
    loadOverview: () => useAdminOverviewStore().loadOverview(),
    loadServerSettings: () => useAdminServerSettingsStore().loadServerSettings(),
    loadServers: () => useAdminServersStore().loadServers(),
    loadEvents: () => useAdminEventLogStore().loadEvents(),
    loadConnections: () => useAdminConnectionsStore().loadConnections(),
    serverList: () => useAdminServersStore().servers,
    replaceServers: (next) => {
      useAdminServersStore().servers = next;
    },
    probeServer: (id) => useAdminServersStore().probeServer(id),
    resetAll: () => {
      useAdminGatewayStore().reset();
      useAdminOverviewStore().reset();
      useAdminUsersStore().reset();
      useAdminInvitesStore().reset();
      useAdminConnectionsStore().reset();
      useAdminEventLogStore().reset();
      useAdminDiagnosticsStore().reset();
      useAdminServerSettingsStore().reset();
      useAdminServersStore().reset();
      useAdminServerOrderStore().reset();
      useAdminServerDialogStore().reset();
    },
  });
}
