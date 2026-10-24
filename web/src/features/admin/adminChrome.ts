// Frame classes of the console shell and the two sign-in screens. The shell and the sidebar are sized against --ui-scale on desktop
// (the app is zoomed up on large displays, so viewport heights are divided by the zoom).
export const scaledHeight =
  "desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))] desktop:min-h-[calc(100dvh/var(--ui-scale))]";
export const centerCard = "absolute inset-0 grid place-content-center justify-items-center text-fg-muted";
export const authPage =
  "grid h-dvh min-h-0 place-items-center overflow-hidden bg-surface-0 bg-[radial-gradient(circle_at_50%_10%,color-mix(in_srgb,var(--color-accent)_20%,transparent),transparent_30rem)] p-6.25 max-desktop:h-auto max-desktop:min-h-dvh max-desktop:overflow-visible";
export const authCard =
  "max-h-[calc(100dvh-50px)] w-full max-w-107.5 overflow-y-auto text-center max-desktop:max-h-none max-desktop:overflow-visible";
export const consoleFrame = `grid h-dvh min-h-dvh grid-cols-[236px_minmax(0,1fr)] overflow-hidden ${scaledHeight} max-desktop:flex max-desktop:h-auto max-desktop:flex-col max-desktop:overflow-visible`;
export const sidebarFrame = `sticky top-0 flex h-dvh flex-col border-r border-line bg-surface-1 px-4.5 py-6.5 text-fg ${scaledHeight} max-desktop:static max-desktop:h-auto max-desktop:w-full max-desktop:flex-row max-desktop:items-center max-desktop:border-r-0 max-desktop:border-b max-desktop:px-4 max-desktop:py-3`;
