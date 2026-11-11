import type { AgentDetailMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import { computeRegionOutlineEdges, tileIndexToPosition } from "./village-geometry";

export type PerceptionView = AgentDetailMessage["perceptionView"];

const VISIBLE_TILE_COLOR = "#fff4a0";
const SPEECH_REACH_COLOR = "#5ad1ff";

interface PerceptionOverlayProps {
  view: NonNullable<PerceptionView>;
  mapWidthTiles: number;
  mapHeightTiles: number;
  tileSize: number;
}

/** Debug overlay: shades the selected agent's visible tiles and outlines its normal speech reach. */
export function PerceptionOverlay({
  view,
  mapWidthTiles,
  mapHeightTiles,
  tileSize,
}: PerceptionOverlayProps) {
  const { visibleTileAlpha, speechReachLineWidth } = clientConfig.village;
  const outlineEdges = computeRegionOutlineEdges(view.speechReachTiles, mapWidthTiles);
  return (
    <svg
      className="village-layer"
      width={mapWidthTiles * tileSize}
      height={mapHeightTiles * tileSize}
      aria-hidden="true"
    >
      <g fill={VISIBLE_TILE_COLOR} fillOpacity={visibleTileAlpha}>
        {view.visibleTiles.map((index) => {
          const tile = tileIndexToPosition(index, mapWidthTiles);
          return (
            <rect
              key={index}
              x={tile.x * tileSize}
              y={tile.y * tileSize}
              width={tileSize}
              height={tileSize}
            />
          );
        })}
      </g>
      <g stroke={SPEECH_REACH_COLOR} strokeWidth={speechReachLineWidth}>
        {outlineEdges.map((edge) => (
          <line
            key={`${edge.from.x},${edge.from.y},${edge.to.x},${edge.to.y}`}
            x1={edge.from.x * tileSize}
            y1={edge.from.y * tileSize}
            x2={edge.to.x * tileSize}
            y2={edge.to.y * tileSize}
          />
        ))}
      </g>
    </svg>
  );
}
