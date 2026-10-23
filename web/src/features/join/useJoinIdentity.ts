import { onMounted, ref, watch, type Ref } from "vue";
import { isLocalPersistenceAvailable } from "@/shared/services/localPersistence.js";
import type { useIdentityManager } from "@/features/identity";

export interface UseJoinIdentityOptions {
  manager: ReturnType<typeof useIdentityManager>;
  identityMaterial: Ref<string>;
  rememberIdentity: Ref<boolean>;
}

/** Binds the join screen's connect inputs to the selected device identity: the chosen record's material
 *  flows into `identityMaterial` and marks the connection as using a saved identity, while the ephemeral
 *  choice clears both. `identityReady` flips once the identity list has loaded. */
export function useJoinIdentity({ manager, identityMaterial, rememberIdentity }: UseJoinIdentityOptions) {
  const identityReady = ref(!isLocalPersistenceAvailable());

  watch(
    [manager.selectedId, manager.identities],
    ([id, list]) => {
      const record = id ? list.find((entry) => entry.id === id) : undefined;
      identityMaterial.value = record?.privateMaterial ?? "";
      rememberIdentity.value = Boolean(record);
    },
    { immediate: true },
  );

  onMounted(() => {
    void manager.init().finally(() => {
      identityReady.value = true;
    });
  });

  return { identityReady };
}
