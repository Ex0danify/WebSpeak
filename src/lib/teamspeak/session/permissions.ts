import type { CommandRow } from "../wire/commandRows.js";
import { parseI32 } from "../wire/commandValues.js";

/** The permissions that decide whether we may write to a channel or to the whole server. */
export const TextPermission = {
  channel: "b_client_channel_textmessage_send",
  server: "b_client_server_textmessage_send",
} as const;

/**
 * Our own permissions as the server reports them. It names none of them: `permissionlist` gives the names
 * and a permission id is the position of its name in that list, starting at 1. The values come with the
 * welcome and later only for what changed. A permission the server never mentioned is not granted.
 */
export class PermissionTable {
  readonly #ids = new Map<string, number>();
  readonly #values = new Map<number, number>();
  #valuesReceived = false;

  /** Replaces the names with the rows of `permissionlist`. Returns whether the list had any. */
  setNames(rows: readonly CommandRow[]): boolean {
    const names = rows.flatMap((row) => (row.permname ? [row.permname] : []));
    if (names.length === 0) return false;
    this.#ids.clear();
    names.forEach((name, index) => this.#ids.set(name, index + 1));
    return true;
  }

  /** Merges the rows of `notifyclientneededpermissions`. A revoked permission comes back with 0. */
  setValues(rows: readonly CommandRow[]): boolean {
    let changed = false;
    for (const row of rows) {
      const id = parseI32(row.permid);
      const value = parseI32(row.permvalue);
      if (id === undefined || value === undefined) continue;
      this.#values.set(id, value);
      changed = true;
    }
    this.#valuesReceived ||= changed;
    return changed;
  }

  /** Undefined until both the names and the first values arrived, then true when the permission is set. */
  granted(name: string): boolean | undefined {
    const id = this.#ids.get(name);
    if (id === undefined || !this.#valuesReceived) return undefined;
    return (this.#values.get(id) ?? 0) !== 0;
  }
}
