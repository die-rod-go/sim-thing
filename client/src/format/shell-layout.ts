export interface SidePanelBounds {
  minSidePanelWidthPx: number;
  maxSidePanelWidthPx: number;
  maxSidePanelWindowFraction: number;
}

/** Clamps a dragged side panel width to the configured bounds and a share of the window. */
export function clampSidePanelWidth(
  width: number,
  windowWidth: number,
  bounds: SidePanelBounds,
): number {
  const upperBound = Math.max(
    bounds.minSidePanelWidthPx,
    Math.min(bounds.maxSidePanelWidthPx, windowWidth * bounds.maxSidePanelWindowFraction),
  );
  return Math.min(Math.max(width, bounds.minSidePanelWidthPx), upperBound);
}
