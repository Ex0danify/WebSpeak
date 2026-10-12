/**
 * How the admin stores reach each other without importing each other. Each depends on the session store and this module only,
 * and `adminStores.ts` wires the real stores in once from the view that owns the console.
 */
export interface AdminSiblings {
  loadOverview(): Promise<void>;
  loadOperations(): Promise<void>;
  loadServerSettings(): Promise<void>;
  /** Back to the empty state, for logout. */
  resetAll(): void;
}

let siblings: AdminSiblings | null = null;

export function provideAdminSiblings(next: AdminSiblings): void {
  siblings = next;
}

export function adminSiblings(): AdminSiblings {
  if (!siblings) throw new Error("The admin stores are not wired: call registerAdminStores() first");
  return siblings;
}
