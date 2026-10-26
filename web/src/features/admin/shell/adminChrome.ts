// Frame classes of the console shell and the two sign-in screens. On desktop the sidebar and the sign-in screens are sized
// against --ui-scale (the app is zoomed up on large displays, so viewport heights are divided by the zoom). The console itself
// grows with its page and scrolls the document.
const scaledMinHeight = "desktop:min-h-[calc(100dvh/var(--ui-scale))]";
export const scaledHeight = `desktop:h-[calc(100dvh/var(--ui-scale))] desktop:max-h-[calc(100dvh/var(--ui-scale))] ${scaledMinHeight}`;
export const centerCard = `grid min-h-dvh place-content-center justify-items-center text-fg-muted ${scaledHeight}`;
export const authPage = `grid h-dvh min-h-0 place-items-center overflow-hidden bg-surface-0 bg-[radial-gradient(circle_at_50%_10%,color-mix(in_srgb,var(--color-accent)_20%,transparent),transparent_30rem)] p-6.25 ${scaledHeight} max-desktop:h-auto max-desktop:min-h-dvh max-desktop:overflow-visible`;
export const authCard =
  "max-h-[calc(100dvh/var(--ui-scale)_-_50px)] w-full max-w-107.5 overflow-y-auto text-center max-desktop:max-h-none max-desktop:overflow-visible";
export const consoleFrame = `grid min-h-dvh grid-cols-[236px_minmax(0,1fr)] ${scaledMinHeight} max-desktop:flex max-desktop:flex-col`;
// The sidebar stays in view while the page scrolls. Below 851 px it is the bar of the four pages along the bottom edge, last
// in the layout and first in the markup.
export const sidebarFrame = `sticky top-0 flex h-dvh flex-col self-start border-r border-line bg-surface-1 px-4.5 py-6.5 text-fg ${scaledHeight} max-desktop:bottom-0 max-desktop:z-20 max-desktop:order-last max-desktop:h-auto max-desktop:min-h-0 max-desktop:flex-row max-desktop:self-auto max-desktop:border-t max-desktop:border-r-0 max-desktop:p-0`;
