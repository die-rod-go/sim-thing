/** One speaker's bubble stack, measured, before placement. Centered on anchorX, growing upward. */
export interface BubbleStackBox {
  agentId: string;
  anchorX: number;
  anchorBottom: number;
  width: number;
  height: number;
}

interface PlacedBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function toPlacedBox(stack: BubbleStackBox, bottom: number): PlacedBox {
  const halfWidth = stack.width / 2;
  return {
    left: stack.anchorX - halfWidth,
    right: stack.anchorX + halfWidth,
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

/**
 * Places every stack so none overlap: stacks nearest the bottom of the screen keep their spot and
 * the rest are lifted just above whatever they would cover. Returns each stack's bottom edge.
 */
export function layOutBubbleStacks(stacks: BubbleStackBox[], gap: number): Map<string, number> {
  const ordered = [...stacks].sort(
    (first, second) =>
      second.anchorBottom - first.anchorBottom || first.agentId.localeCompare(second.agentId),
  );
  const placedBoxes: PlacedBox[] = [];
  const bottomsByAgent = new Map<string, number>();
  for (const stack of ordered) {
    let bottom = stack.anchorBottom;
    let overlapping = placedBoxes.filter((placed) =>
      doBoxesOverlap(toPlacedBox(stack, bottom), placed, gap),
    );
    while (overlapping.length > 0) {
      bottom = Math.min(...overlapping.map((placed) => placed.top)) - gap;
      overlapping = placedBoxes.filter((placed) =>
        doBoxesOverlap(toPlacedBox(stack, bottom), placed, gap),
      );
    }
    placedBoxes.push(toPlacedBox(stack, bottom));
    bottomsByAgent.set(stack.agentId, bottom);
  }
  return bottomsByAgent;
}
