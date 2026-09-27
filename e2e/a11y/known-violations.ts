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

const roomDesktop = ["room", "room-member-menu", "room-reconnecting", "room-poke", "room-reconnect-failed", "room-audio-notice"];
const roomBanners = ["room-reconnecting", "room-poke", "room-reconnect-failed", "room-audio-notice"];

export const knownViolations: KnownViolation[] = [
  {
    rule: "page-has-heading-one",
    finding: "F39",
    reason: "The connected room has no level-one heading.",
    at: { desktop: roomDesktop, mobile: ["room", ...roomBanners, "room-tab-voice", "room-tab-chat", "room-tab-more"] },
  },
  {
    rule: "landmark-one-main",
    finding: "F39",
    reason: "On a phone the room's Channels and More tabs have no main landmark.",
    at: { mobile: ["room", "room-tab-more"] },
  },
  {
    rule: "aria-required-children",
    finding: "F40",
    reason: "The chat tab strip has role tablist but holds plain buttons, not tabs.",
    at: { desktop: roomDesktop, mobile: ["room-tab-chat"] },
  },
  {
    rule: "aria-prohibited-attr",
    finding: "F41",
    reason: "The member flags carry aria-label on elements with no role (a div and spans).",
    at: { desktop: roomDesktop },
  },
  {
    rule: "button-name",
    finding: "F42",
    reason: "The phone's Voice tab has icon-only buttons (mute and settings) with no accessible name.",
    at: { mobile: ["room-tab-voice", ...roomBanners] },
  },
  {
    rule: "aria-hidden-focus",
    finding: "F43",
    reason: "The toast viewport's focus proxies and the member row's slider behind an open menu are focusable inside aria-hidden.",
    at: { desktop: ["room-member-menu", "room-poke"] },
  },
  {
    rule: "region",
    finding: "F44",
    reason: "Header, footer and popup content sit outside any landmark.",
    at: { desktop: ["join", "room-member-menu"], mobile: ["join", "room-tab-more"] },
  },
  {
    rule: "landmark-unique",
    finding: "F44",
    reason: "The demo page's channel panel is an unnamed aside next to another.",
    at: { desktop: ["demo"], mobile: ["demo"] },
  },
  {
    rule: "empty-table-header",
    finding: "F45",
    reason: "The sessions table's action column has an empty header cell.",
    at: { desktop: ["admin-operations"], mobile: ["admin-operations"] },
  },
  {
    rule: "scrollable-region-focusable",
    finding: "F45",
    reason: "The connection and log lists scroll but cannot take keyboard focus.",
    at: { desktop: ["admin-operations"], mobile: ["admin-operations"] },
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
