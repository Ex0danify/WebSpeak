import { provideAdminSiblings } from "@/features/admin/core/adminSiblings";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { useAdminServerDialogStore } from "@/features/admin/gateway/adminServerDialog";
import { useAdminServerOrderStore } from "@/features/admin/gateway/adminServerOrder";
import { useAdminServersStore } from "@/features/admin/gateway/adminServers";
import { useAdminServerSettingsStore } from "@/features/admin/gateway/adminServerSettings";
import { useAdminUsersStore } from "@/features/admin/users/adminUsers";

/** Wires the stores to each other. Call it once before the console is used; stores are resolved when a call happens. */
export function registerAdminStores(): void {
  provideAdminSiblings({
    loadOverview: () => useAdminOverviewStore().loadOverview(),
    loadServerSettings: () => useAdminServerSettingsStore().loadServerSettings(),
    loadServers: () => useAdminServersStore().loadServers(),
    serverList: () => useAdminServersStore().servers,
    replaceServers: (next) => {
      useAdminServersStore().servers = next;
    },
    probeServer: (id) => useAdminServersStore().probeServer(id),
    resetAll: () => {
      useAdminOverviewStore().reset();
      useAdminUsersStore().reset();
      useAdminDiagnosticsStore().reset();
      useAdminServerSettingsStore().reset();
      useAdminServersStore().reset();
      useAdminServerOrderStore().reset();
      useAdminServerDialogStore().reset();
    },
  });
}
