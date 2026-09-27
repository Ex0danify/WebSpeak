// The axe violations the product has today, each tied to a finding in docs/testing/findings.md.
// The scan fails on a violation that is not listed here, and on a listed one that no longer
// happens, so fixing a finding means deleting its rows in the same commit. Violations are the same
// in light and dark, so a row covers both themes. Fixes are deferred (track 7).

export interface KnownViolation {
  /** The axe rule id. */
  rule: string;
  finding: string;
  reason: string;
  /** The states (see `axe.spec.ts`) where the rule fires, per project. */
  at: { desktop?: string[]; mobile?: string[] };
}

export const knownViolations: KnownViolation[] = [
  {
    rule: "aria-hidden-focus",
    finding: "F43",
    reason: "The toast viewport's two focus-proxy spans are aria-hidden and focusable (tabindex 0) by reka-ui's own ToastViewport/FocusProxy, at the latest version, with no slot or prop to change either attribute; kept as library markup. The member row's slider behind an open menu is fixed.",
    at: { desktop: ["room-poke"] },
  },
  {
    rule: "region",
    finding: "F44",
    reason: "The member menu's popup is a reka-ui portal that renders outside the app-shell's landmarks; kept as library markup. The join page's header and footer are fixed.",
    at: { desktop: ["room-member-menu"] },
  },
];

/** The rows that apply to one state on one project, by rule. */
export function knownFor(state: string, project: string): Map<string, KnownViolation> {
  const rows = new Map<string, KnownViolation>();
  for (const row of knownViolations) {
    if (row.at[project as "desktop" | "mobile"]?.includes(state)) rows.set(row.rule, row);
  }
  return rows;
}
