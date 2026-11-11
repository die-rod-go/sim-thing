import { useEffect, useRef } from "react";
import { clientConfig } from "../client-config";
import type { GlyphPainter } from "./glyph-painter";
import { findTileGlyph, type TiledMap } from "./tiled-map";

interface TileCanvasProps {
  map: TiledMap;
  glyphPainter: GlyphPainter;
}

function drawTileLayers(
  context: CanvasRenderingContext2D,
  map: TiledMap,
  glyphPainter: GlyphPainter,
): void {
  const { requiredLayers, optionalLayers } = clientConfig.map;
  const drawnLayerNames: readonly string[] = [...requiredLayers, ...optionalLayers];
  const { tileWidth, tileHeight } = map;
  for (const layer of map.tileLayers) {
    if (!layer.isVisible || !drawnLayerNames.includes(layer.name)) continue;
    context.globalAlpha = layer.opacity;
    layer.gids.forEach((gid, cellIndex) => {
      const glyph = findTileGlyph(map, gid);
      if (!glyph) return;
      const column = cellIndex % map.width;
      const row = Math.floor(cellIndex / map.width);
      glyphPainter.drawGlyph(context, glyph, {
        x: column * tileWidth,
        y: row * tileHeight,
        width: tileWidth,
        height: tileHeight,
      });
    });
  }
  context.globalAlpha = 1;
}

/** The static map, drawn once from tile glyphs at native size; CSS scales it with nearest-neighbor sampling. */
export function TileCanvas({ map, glyphPainter }: TileCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) throw new Error("The browser could not create a 2D canvas for the village map");
    drawTileLayers(context, map, glyphPainter);
  }, [map, glyphPainter]);

  return (
    <canvas
      className="village-tiles"
      ref={canvasRef}
      width={map.width * map.tileWidth}
      height={map.height * map.tileHeight}
    />
  );
}
