import { onMounted, ref, watch, type Ref } from "vue";
import { isLocalPersistenceAvailable, loadStoredIdentity, removeStoredIdentity, saveStoredIdentity } from "@/shared/services/localPersistence.js";
import { readStorage, writeStorage } from "@/shared/services/safeStorage";

export interface UseJoinIdentityOptions {
  identityMaterial: Ref<string>;
  rememberIdentity: Ref<boolean>;
}

/** The remembered identity of the join screen: restore on mount, save when the gateway hands one
 *  out, forget when the user opts out. `identityReady` flips once the stored identity has been read. */
export function useJoinIdentity({ identityMaterial, rememberIdentity }: UseJoinIdentityOptions) {
  const identityReady = ref(!isLocalPersistenceAvailable());

  watch(rememberIdentity, (remember) => {
    writeStorage("webspeak:remember-identity", remember ? "1" : "0");
    if (!remember) {
      identityMaterial.value = "";
      void removeStoredIdentity();
    }
  });
  watch([rememberIdentity, identityMaterial], ([remember, material]) => {
    if (remember && material) void saveStoredIdentity(material);
    if (!remember && material) identityMaterial.value = "";
  });

  onMounted(() => {
    void loadStoredIdentity().then((stored) => {
      if (stored && readStorage("webspeak:remember-identity") !== "0") {
        identityMaterial.value = stored.privateMaterial;
        rememberIdentity.value = true;
      }
    }).finally(() => {
      identityReady.value = true;
    });
  });

  return { identityReady };
}
