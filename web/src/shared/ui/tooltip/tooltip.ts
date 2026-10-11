// Tooltip surface: inverted (fg on surface) so it reads on any theme, as in
// the mock. `shadow-lg` because it floats. It never receives focus or
// pointer input, so it carries no interactive states.
export const tooltipContentClass =
  "z-50 box-border max-w-[min(20rem,calc(100vw-1rem))] rounded-sm bg-fg px-2.5 py-1.5 font-sans text-xs leading-4 text-surface-1 shadow-lg";

export const tooltipKbdClass = "ml-1.5 font-mono text-caption font-medium opacity-75";
