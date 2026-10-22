export {
  useIdentityManager,
  type MintPhase,
  type MintState,
  type CreateOptions,
  type CreateResult,
  type ImportResult,
  type ExportedIdentity,
} from "@/features/identity/useIdentityManager";
export {
  mintIdentity,
  validateIdentity,
  IdentityMintError,
  type MintOptions,
  type MintResult,
} from "@/features/identity/identityMintClient";
export { default as IdentityPicker } from "@/features/identity/IdentityPicker.vue";
export { default as IdentityManagerDialog } from "@/features/identity/IdentityManagerDialog.vue";
export { translations as identityMessages } from "@/features/identity/i18n";
