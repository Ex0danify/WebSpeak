// The touch targets under 44 px that the guest page and the room have at 390 px today (redesign plan
// section 8; finding F48). The list is a ratchet: a target that is not here, is smaller than its row,
// or is more numerous fails the test, and a row whose target is now 44 px or more must be deleted.
// `target` is the tag and the label the test reads (`smallTargets`), `min` the smallest side seen,
// `count` how many of them one screen has at most.

export interface SmallTargetRow {
  target: string;
  min: number;
  count?: number;
}

export const smallTargetRows: SmallTargetRow[] = [
  // Join page footer and header
  { target: "a GitHub repository", min: 28 },
  { target: "button QQ group", min: 28 },
  { target: "a Bilibili profile", min: 28 },
  { target: "a View changelog", min: 28 },
  { target: "a Admin console", min: 28 },
  { target: "button Language", min: 32 },
  // Channels tab
  { target: "button Available", min: 34 },
  // Room header, Voice and Chat tabs
  { target: "button Network performance", min: 32 },
  { target: "button Copy invite link", min: 32 },
  { target: "button Microphone on", min: 32 },
  { target: "button Audio settings", min: 32 },
  { target: "button Exit", min: 32 },
  { target: "button Share screen", min: 25 },
  { target: "button Share settings", min: 25 },
  // Audio settings dialog and the member sheet (a slider's thumb is 22 px; its track is the target)
  { target: "button Start test", min: 32 },
  { target: "span input-volume", min: 22 },
  { target: "span vox-threshold", min: 22 },
  { target: "span output-volume", min: 22 },
  { target: "span notification-volume", min: 22 },
  { target: "span Member volume", min: 22 },
];
