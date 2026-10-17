// The axe violations the product has today, each tied to its source. The scan fails on an unlisted violation and on a listed
// one that no longer happens, so fixing one means deleting its rows in the same commit. Light and dark behave the same, so a
// row covers both.

export interface KnownViolation {
  /** The axe rule id. */
  rule: string;
  source: string;
  reason: string;
  /** The states (see `axe.spec.ts`) where the rule fires, per project. */
  at: { desktop?: string[]; mobile?: string[] };
}

export const knownViolations: KnownViolation[] = [
  {
    rule: "aria-hidden-focus",
    source: "reka-ui toast viewport",
    reason:
      "The toast viewport's two focus-proxy spans are aria-hidden and focusable (tabindex 0) by reka-ui's own ToastViewport/FocusProxy, at the latest version, with no slot or prop to change either attribute; kept as library markup. The member row's slider behind an open menu is fixed.",
    at: { desktop: ["room-poke"] },
  },
  {
    rule: "region",
    source: "reka-ui menu portal",
    reason:
      "The member and About menus' popups is a reka-ui portal that renders outside the app-shell's landmarks; kept as library markup. The join page's header and footer are fixed.",
    at: { desktop: ["room-member-menu", "join-about-menu"] },
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
