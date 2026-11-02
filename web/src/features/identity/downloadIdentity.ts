import type { ExportedIdentity } from "@/features/identity/useIdentityManager";

/** Saves an identity as a `.webspeak-identity.json` file, the format the import reads back. */
export function downloadIdentity(record: ExportedIdentity): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(record.label || "identity").replace(/[^\w.-]+/g, "-")}.webspeak-identity.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
