export const en = {
  identityLabel: "Device identity",
  identityEphemeral: "Ephemeral — don't save",
  identityManage: "Manage…",
  identityUnnamed: "Unnamed identity",

  identityMintQueued: "Waiting for the identity service…",
  identityMintAhead: "{{count}} ahead of you",
  identityMintProgress: "Creating identity…",

  identityManagerTitle: "Device identities",
  identityManagerDescription: "Identities are stored only on this device. Pick one per connection.",
  identityEmpty: "No saved identities yet. Create one below.",
  identityCreatedOn: "Created {{date}}",

  identityNewHeading: "Create a new identity",
  identityNameLabel: "Name",
  identityNamePlaceholder: "e.g. Gaming or Work",
  identityCreate: "Create",
  identityCreating: "Creating…",
  identityCancel: "Cancel",

  identityRename: "Rename",
  identityRenameTitle: "Rename identity",
  identityDelete: "Delete",
  identityDeleteConfirm: "Delete this identity? This cannot be undone!",
  identityExport: "Export",
  identityImport: "Import",
  identityImportHeading: "Import an identity",
  identitySave: "Save",

  identityExportWarning: "This file is a private key. Keep it secret!",
  identityImportInvalid: "That file is not a valid identity.",

  identityCreatedToast: "Identity created",
  identityRenamedToast: "Identity renamed",
  identityDeletedToast: "Identity deleted",
  identityExportedToast: "Identity exported",
  identityImportedToast: "Identity imported",

  identityErrorBusy: "The identity service is busy. Try again in a moment.",
  identityErrorLevelTooHigh: "The requested security level is above the gateway limit.",
  identityErrorNotReady: "The gateway is not ready yet. Try again shortly.",
  identityErrorFailed: "The identity could not be created. Try again.",
  identityErrorSave: "The identity could not be saved on this device.",
} satisfies Record<string, string>;
