import { useEffect, useRef } from "react";
import { clientConfig } from "../client-config";
import { findTileSourceRect, type TiledMap } from "./tiled-map";

interface TileCanvasProps {
  map: TiledMap;
  tilesetImage: HTMLImageElement;
}

function drawTileLayers(
  context: CanvasRenderingContext2D,
  map: TiledMap,
  tilesetImage: HTMLImageElement,
): void {
  const { requiredLayers, optionalLayers } = clientConfig.map;
  const drawnLayerNames: readonly string[] = [...requiredLayers, ...optionalLayers];
  const { tileWidth, tileHeight } = map;
  for (const layer of map.tileLayers) {
    if (!layer.isVisible || !drawnLayerNames.includes(layer.name)) continue;
    context.globalAlpha = layer.opacity;
    layer.gids.forEach((gid, cellIndex) => {
      const source = findTileSourceRect(map, gid);
      if (!source) return;
      const column = cellIndex % map.width;
      const row = Math.floor(cellIndex / map.width);
      context.drawImage(
        tilesetImage,
        source.x,
        source.y,
        tileWidth,
        tileHeight,
        column * tileWidth,
        row * tileHeight,
        tileWidth,
        tileHeight,
      );
    });
  }
  context.globalAlpha = 1;
}

/** The static map, drawn once at native size; CSS scales it with nearest-neighbor sampling. */
export function TileCanvas({ map, tilesetImage }: TileCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) throw new Error("The browser could not create a 2D canvas for the village map");
    drawTileLayers(context, map, tilesetImage);
  }, [map, tilesetImage]);

  return (
    <canvas
      className="village-tiles"
      ref={canvasRef}
      width={map.width * map.tileWidth}
      height={map.height * map.tileHeight}
    />
  );
}
