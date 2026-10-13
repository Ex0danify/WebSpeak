export type SpacerAlign = "left" | "center" | "right" | "repeat";

export interface Spacer {
  align: SpacerAlign;
  /** The label for left/center/right spacers, the tile for repeat spacers. */
  text: string;
}

const SPACER_NAME = /^\[(c|l|r|\*)?spacer\d*\](.*)$/i;

/** TeamSpeak's spacer convention: a channel named `[spacer]`, `[lspacer]`, `[cspacer]`, `[rspacer]` or `[*spacer]`
 *  followed by text is a layout element, not a room. Returns null for ordinary channel names. */
export function parseSpacer(name: string): Spacer | null {
  const match = SPACER_NAME.exec(name.trim());
  if (!match) return null;
  const kind = (match[1] ?? "").toLowerCase();
  const text = match[2] ?? "";
  if (kind === "*") return text ? { align: "repeat", text } : null;
  return { align: kind === "c" ? "center" : kind === "r" ? "right" : "left", text: text.trim() };
}
