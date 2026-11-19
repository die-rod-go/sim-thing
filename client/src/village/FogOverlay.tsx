import { useEffect, useRef } from "react";
import { clientConfig } from "../client-config";
import type { TiledMap } from "./tiled-map";
import { tileIndexToPosition } from "./village-geometry";

interface FogOverlayProps {
  map: TiledMap;
  /** Tile indexes (y * width + x) the played agent can see. */
  visibleTiles: readonly number[];
}

/** Darkens every tile the played agent can't see, over the map and its things. */
export function FogOverlay({ map, visibleTiles }: FogOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) throw new Error("The browser could not create a 2D canvas for the fog");
    const { tileWidth, tileHeight } = map;
    context.clearRect(0, 0, map.width * tileWidth, map.height * tileHeight);
    context.fillStyle = `rgb(0 0 0 / ${clientConfig.player.fogAlpha * 100}%)`;
    context.fillRect(0, 0, map.width * tileWidth, map.height * tileHeight);
    for (const index of visibleTiles) {
      const tile = tileIndexToPosition(index, map.width);
      context.clearRect(tile.x * tileWidth, tile.y * tileHeight, tileWidth, tileHeight);
    }
  }, [map, visibleTiles]);

  return (
    <canvas
      className="village-tiles village-fog"
      ref={canvasRef}
      width={map.width * map.tileWidth}
      height={map.height * map.tileHeight}
      aria-hidden="true"
    />
  );
}
