import { ref } from "vue";
import {
  listIdentities,
  loadLocalPreferences,
  removeIdentity,
  renameIdentity as renameStoredIdentity,
  saveIdentity,
  saveLocalPreferences,
  type StoredIdentity,
} from "@/shared/services/localPersistence.js";
import { IdentityMintError, mintIdentity, validateIdentity } from "@/features/identity/identityMintClient.js";

export type MintPhase = "idle" | "queued" | "minting" | "done" | "error";

/** Progress of the in-flight mint, for the picker UI to bind to. */
export interface MintState {
  phase: MintPhase;
  /** Waiters ahead in the queue while `phase` is "queued". */
  ahead?: number;
  /** The gateway error code when `phase` is "error". */
  code?: string;
}

export interface CreateOptions {
  label?: string;
  level?: number;
  signal?: AbortSignal;
}

export type CreateResult = { ok: true; identity: StoredIdentity } | { ok: false; code: string };
export type ImportResult = { ok: true; identity: StoredIdentity } | { ok: false; code: string };

export interface ExportedIdentity {
  label?: string;
  privateMaterial: string;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Manages the device's saved identities over the persistence layer and the gateway mint/validate
 *  endpoints: list, select, create (minted), rename, remove, import, export. */
export function useIdentityManager() {
  const identities = ref<StoredIdentity[]>([]);
  const selectedId = ref<string | undefined>(undefined);
  const defaultId = ref<string | undefined>(undefined);
  const mintState = ref<MintState>({ phase: "idle" });

  const has = (id: string | undefined): boolean => Boolean(id) && identities.value.some((entry) => entry.id === id);

  async function refresh(): Promise<void> {
    identities.value = await listIdentities();
  }

  async function init(): Promise<void> {
    await refresh();
    const preferences = await loadLocalPreferences();
    // A populated store without a stored default adopts its first entry, so one identity is always marked.
    const resolvedDefault = has(preferences.defaultIdentityId) ? preferences.defaultIdentityId : identities.value[0]?.id;
    if (resolvedDefault !== preferences.defaultIdentityId) await setDefault(resolvedDefault);
    else defaultId.value = resolvedDefault;
    // Arrival always starts from the default: the dropdown is a per-connection override, not a remembered
    // choice. Persisting it keeps the recents log tagging the identity that is actually shown.
    await select(defaultId.value);
  }

  async function select(id: string | undefined): Promise<void> {
    selectedId.value = id;
    await saveLocalPreferences({ schemaVersion: 1, selectedIdentityId: id });
  }

  async function setDefault(id: string | undefined): Promise<void> {
    defaultId.value = id;
    await saveLocalPreferences({ schemaVersion: 1, defaultIdentityId: id });
  }

  async function create({ label, level, signal }: CreateOptions = {}): Promise<CreateResult> {
    mintState.value = { phase: "queued" };
    try {
      const minted = await mintIdentity({
        level,
        signal,
        onPosition: (ahead) => (mintState.value = { phase: "queued", ahead }),
        onMinting: () => (mintState.value = { phase: "minting" }),
      });
      const now = Date.now();
      const identity: StoredIdentity = { id: newId(), label, privateMaterial: minted.identity, createdAt: now, lastUsedAt: now };
      await saveIdentity(identity);
      await refresh();
      await select(identity.id);
      if (!defaultId.value) await setDefault(identity.id);
      mintState.value = { phase: "done" };
      return { ok: true, identity };
    } catch (error) {
      const code = error instanceof IdentityMintError ? error.code : "MINT_FAILED";
      mintState.value = { phase: "error", code };
      return { ok: false, code };
    }
  }

  async function rename(id: string, label: string): Promise<void> {
    await renameStoredIdentity(id, label);
    await refresh();
  }

  async function remove(id: string): Promise<void> {
    await removeIdentity(id);
    await refresh();
    if (defaultId.value === id) await setDefault(identities.value[0]?.id);
    if (selectedId.value === id) await select(defaultId.value);
  }

  function exportIdentity(id: string): ExportedIdentity | null {
    const identity = identities.value.find((entry) => entry.id === id);
    return identity ? { label: identity.label, privateMaterial: identity.privateMaterial } : null;
  }

  async function importIdentity(privateMaterial: string, label?: string): Promise<ImportResult> {
    try {
      await validateIdentity(privateMaterial);
    } catch (error) {
      return { ok: false, code: error instanceof IdentityMintError ? error.code : "INVALID_IDENTITY" };
    }
    const now = Date.now();
    const identity: StoredIdentity = { id: newId(), label, privateMaterial, createdAt: now, lastUsedAt: now };
    const saved = await saveIdentity(identity);
    if (!saved) return { ok: false, code: "SAVE_FAILED" };
    await refresh();
    await select(identity.id);
    if (!defaultId.value) await setDefault(identity.id);
    return { ok: true, identity };
  }

  return {
    identities,
    selectedId,
    defaultId,
    mintState,
    init,
    refresh,
    select,
    setDefault,
    create,
    rename,
    remove,
    exportIdentity,
    importIdentity,
  };
}
