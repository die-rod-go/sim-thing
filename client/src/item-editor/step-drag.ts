/** The pointer's place over a row: which row, and whether it is in the row's lower half. */
export interface DropTarget {
  overIndex: number;
  isBelowMiddle: boolean;
}

/** Where the dragged step ends up (an index for `moveStep`) when dropped at `target`. */
export function findDropIndex(fromIndex: number, target: DropTarget): number {
  const slot = target.overIndex + (target.isBelowMiddle ? 1 : 0);
  return slot > fromIndex ? slot - 1 : slot;
}

export function isBelowMiddleOf(rowTop: number, rowHeight: number, pointerY: number): boolean {
  return pointerY - rowTop > rowHeight / 2;
}
