/** One speaker's bubble stack, measured, before placement. Centered on anchorX, growing upward. */
export interface BubbleStackBox {
  agentId: string;
  anchorX: number;
  anchorBottom: number;
  width: number;
  height: number;
}

/** Where a stack ends up: its horizontal center and its bottom edge, in screen pixels. */
export interface BubbleStackPlacement {
  centerX: number;
  bottom: number;
}

export interface BubbleLayoutSpacing {
  gap: number;
  /** How far a stack may slide sideways off its speaker, as a share of its width, before it is lifted. */
  maxSideShiftFraction: number;
  /** Speakers closer than this horizontally count as one column and stack vertically. */
  sameColumnTolerance: number;
}

interface PlacedBox {
  anchorX: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function toPlacedBox(stack: BubbleStackBox, centerX: number, bottom: number): PlacedBox {
  const halfWidth = stack.width / 2;
  return {
    anchorX: stack.anchorX,
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: bottom - stack.height,
    bottom,
  };
}

function doBoxesOverlap(first: PlacedBox, second: PlacedBox, gap: number): boolean {
  return (
    first.left < second.right + gap &&
    first.right > second.left - gap &&
    first.top < second.bottom + gap &&
    first.bottom > second.top - gap
  );
}

function findOverlapping(
  stack: BubbleStackBox,
  centerX: number,
  bottom: number,
  placedBoxes: readonly PlacedBox[],
  gap: number,
): PlacedBox[] {
  const candidate = toPlacedBox(stack, centerX, bottom);
  return placedBoxes.filter((placed) => doBoxesOverlap(candidate, placed, gap));
}

function findNearestByAnchor(anchorX: number, boxes: readonly PlacedBox[]): PlacedBox {
  return boxes.reduce((nearest, box) =>
    Math.abs(box.anchorX - anchorX) < Math.abs(nearest.anchorX - anchorX) ? box : nearest,
  );
}

/**
 * Slides the stack sideways at this height, away from the nearest speaker it would cover, until it
 * fits. Returns null when it would have to slide too far, or when that speaker shares its column,
 * since neither side is then "away".
 */
function findSideSlot(
  stack: BubbleStackBox,
  bottom: number,
  placedBoxes: readonly PlacedBox[],
  spacing: BubbleLayoutSpacing,
): number | null {
  const halfWidth = stack.width / 2;
  let overlapping = findOverlapping(stack, stack.anchorX, bottom, placedBoxes, spacing.gap);
  if (overlapping.length === 0) return stack.anchorX;
  const nearest = findNearestByAnchor(stack.anchorX, overlapping);
  if (Math.abs(nearest.anchorX - stack.anchorX) < spacing.sameColumnTolerance) return null;
  const slidesRight = stack.anchorX > nearest.anchorX;
  let centerX = stack.anchorX;
  // Boxes already slid past are dropped rather than retested: rounding in the edge arithmetic can
  // leave the stack a hair inside one, and retesting it would repeat the same slide forever.
  let unclearedBoxes = placedBoxes;
  while (overlapping.length > 0) {
    centerX = slidesRight
      ? Math.max(...overlapping.map((placed) => placed.right)) + spacing.gap + halfWidth
      : Math.min(...overlapping.map((placed) => placed.left)) - spacing.gap - halfWidth;
    if (Math.abs(centerX - stack.anchorX) > stack.width * spacing.maxSideShiftFraction) return null;
    const clearedBoxes = new Set(overlapping);
    unclearedBoxes = unclearedBoxes.filter((placed) => !clearedBoxes.has(placed));
    overlapping = findOverlapping(stack, centerX, bottom, unclearedBoxes, spacing.gap);
  }
  return centerX;
}

/**
 * Places every stack so none overlap. Stacks nearest the bottom of the screen keep their spot; the
 * rest slide sideways to make room when their speaker stands apart, or are lifted just above
 * whatever they would cover when they share a column or would slide too far.
 */
export function layOutBubbleStacks(
  stacks: BubbleStackBox[],
  spacing: BubbleLayoutSpacing,
): Map<string, BubbleStackPlacement> {
  const ordered = [...stacks].sort(
    (first, second) =>
      second.anchorBottom - first.anchorBottom || first.agentId.localeCompare(second.agentId),
  );
  const placedBoxes: PlacedBox[] = [];
  const placementsByAgent = new Map<string, BubbleStackPlacement>();
  for (const stack of ordered) {
    let bottom = stack.anchorBottom;
    let centerX = findSideSlot(stack, bottom, placedBoxes, spacing);
    while (centerX === null) {
      const covered = findOverlapping(stack, stack.anchorX, bottom, placedBoxes, spacing.gap);
      bottom = Math.min(...covered.map((placed) => placed.top)) - spacing.gap;
      centerX = findSideSlot(stack, bottom, placedBoxes, spacing);
    }
    placedBoxes.push(toPlacedBox(stack, centerX, bottom));
    placementsByAgent.set(stack.agentId, { centerX, bottom });
  }
  return placementsByAgent;
}
