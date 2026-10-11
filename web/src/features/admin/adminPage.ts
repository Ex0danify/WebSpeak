// Frame of an admin page inside the viewport-locked shell: the page is the scroll
// surface, never the document. Below 851 px the document grows instead.
const frame = "mx-auto flex min-h-0 flex-1 flex-col pt-7 pb-4.5 max-desktop:block max-desktop:pt-5 max-desktop:pb-3.5 max-desktop:w-[min(100%-28px,700px)]";
const clip = "overflow-hidden max-desktop:overflow-visible";
const scroll = "min-w-0 overflow-x-hidden overflow-y-auto max-desktop:overflow-x-visible max-desktop:overflow-y-visible";

export const adminPage = `${frame} ${clip} w-[min(1180px,calc(100%-48px))]`;
export const adminPageWide = `${frame} ${clip} w-[min(1400px,calc(100%-48px))]`;
export const adminPageScroll = `${frame} ${scroll} w-[min(1180px,calc(100%-48px))]`;
