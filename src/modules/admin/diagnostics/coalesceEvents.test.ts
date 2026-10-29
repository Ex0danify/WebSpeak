import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../../../infra/persistence/auditRepository.js";
import { coalesceSettingsChanges } from "./coalesceEvents.js";

function change(id: number, second: number, from: number, to: number, ip = "ip-1/loopback"): AuditEntry {
  return {
    id,
    event: "SETTINGS_CHANGED",
    category: "config",
    severity: "info",
    details: { accessMode: "fixed", changes: [{ field: "days", from, to }], ip },
    createdAt: new Date(Date.UTC(2026, 9, 28, 8, 0, second)).toISOString(),
  };
}

const other = (id: number, second: number): AuditEntry => ({ ...change(id, second, 0, 0), event: "GATEWAY_STARTED", details: {} });

describe("coalesceSettingsChanges", () => {
  it("merges a burst into the newest event with the net change", () => {
    const merged = coalesceSettingsChanges([change(5, 4, 24, 23), change(4, 3, 25, 24), change(3, 2, 24, 25), change(2, 1, 32, 24)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 5, details: { changes: [{ field: "days", from: 32, to: 23 }], merged: 4 } });
  });

  it("drops a field that ended where it began", () => {
    const merged = coalesceSettingsChanges([change(3, 3, 25, 24), change(2, 2, 24, 25)]);
    expect(merged[0]!.details.changes).toEqual([]);
  });

  it("keeps changes apart that are far apart in time, from another address, or split by another event", () => {
    expect(coalesceSettingsChanges([change(3, 300, 2, 3), change(2, 0, 1, 2)])).toHaveLength(2);
    expect(coalesceSettingsChanges([change(3, 2, 2, 3, "ip-2/public"), change(2, 1, 1, 2)])).toHaveLength(2);
    expect(coalesceSettingsChanges([change(3, 3, 2, 3), other(2, 2), change(1, 1, 1, 2)])).toHaveLength(3);
  });
});
