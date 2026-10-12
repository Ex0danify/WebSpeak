import { provideAdminSiblings } from "./adminSiblings";
import { useAdminOperationsStore } from "./adminOperations";
import { useAdminOverviewStore } from "./adminOverview";
import { useAdminServerSettingsStore } from "./adminServerSettings";

/** Wires the stores to each other. Call it once before the console is used; stores are resolved when a call happens. */
export function registerAdminStores(): void {
  provideAdminSiblings({
    loadOverview: () => useAdminOverviewStore().loadOverview(),
    loadOperations: () => useAdminOperationsStore().loadOperations(),
    loadServerSettings: () => useAdminServerSettingsStore().loadServerSettings(),
    resetAll: () => {
      useAdminOverviewStore().reset();
      useAdminOperationsStore().reset();
      useAdminServerSettingsStore().reset();
    },
  });
}
