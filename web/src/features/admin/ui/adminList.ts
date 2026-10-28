import type { IconName } from "@/shared/ui/icon";

/** What AdminList, and the card and the view around it, are given: `items` are shown, `total` is what exists. */
export interface AdminListProps<T> {
  items: T[];
  keyOf: (item: T) => string | number;
  total: number;
  emptyText: string;
  emptyIcon: IconName;
  /** The pages of a list that pages itself. */
  pageCount?: number;
  /** The full view of a list that shows only its newest rows. */
  moreTo?: string;
  moreLabel?: string;
}
