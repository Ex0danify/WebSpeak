// The touch targets under 44 px that the guest page and the room have at 390 px today. The list is a ratchet, a target that is
// not here, is smaller than its row or is more numerous fails the test, and a row now at 44 px or more must be deleted.
// `target` is the tag and label the test reads, `min` the smallest side, `count` the most one screen has.

export interface SmallTargetRow {
  target: string;
  min: number;
  count?: number;
}

export const smallTargetRows: SmallTargetRow[] = [];
