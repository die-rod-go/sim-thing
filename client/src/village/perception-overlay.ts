import type * as Phaser from "phaser";
import type { AgentDetailMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import { computeRegionOutlineEdges, tileIndexToPosition } from "./village-geometry";

export type PerceptionView = AgentDetailMessage["perceptionView"];

const VISIBLE_TILE_COLOR = 0xfff4a0;
const SPEECH_REACH_COLOR = 0x5ad1ff;

/** Debug overlay: shades the selected agent's visible tiles and outlines its normal speech reach. */
export function drawPerceptionOverlay(
  graphics: Phaser.GameObjects.Graphics,
  view: PerceptionView,
  mapWidthTiles: number,
): void {
  graphics.clear();
  if (view === null) return;
  const tileSize = clientConfig.map.tileSizePixels;
  graphics.fillStyle(VISIBLE_TILE_COLOR, clientConfig.village.visibleTileAlpha);
  for (const index of view.visibleTiles) {
    const tile = tileIndexToPosition(index, mapWidthTiles);
    graphics.fillRect(tile.x * tileSize, tile.y * tileSize, tileSize, tileSize);
  }
  graphics.lineStyle(clientConfig.village.speechReachLineWidth, SPEECH_REACH_COLOR, 1);
  for (const edge of computeRegionOutlineEdges(view.speechReachTiles, mapWidthTiles)) {
    graphics.lineBetween(
      edge.from.x * tileSize,
      edge.from.y * tileSize,
      edge.to.x * tileSize,
      edge.to.y * tileSize,
    );
  }
}
