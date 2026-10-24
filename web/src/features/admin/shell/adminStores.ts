import { provideAdminSiblings } from "@/features/admin/core/adminSiblings";
import { useAdminOperationsStore } from "@/features/admin/operations/adminOperations";
import { useAdminOverviewStore } from "@/features/admin/overview/adminOverview";
import { useAdminServerDialogStore } from "@/features/admin/server/adminServerDialog";
import { useAdminServerOrderStore } from "@/features/admin/server/adminServerOrder";
import { useAdminServersStore } from "@/features/admin/server/adminServers";
import { useAdminServerSettingsStore } from "@/features/admin/server/adminServerSettings";

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
      useAdminOperationsStore().reset();
      useAdminServerSettingsStore().reset();
      useAdminServersStore().reset();
      useAdminServerOrderStore().reset();
      useAdminServerDialogStore().reset();
    },
  });
}
