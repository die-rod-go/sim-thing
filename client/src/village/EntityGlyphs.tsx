import { useEffect, useMemo, useRef } from "react";
import type { Entity, ThingCatalog } from "@village/shared";
import { listPlacedGlyphs } from "./entity-glyphs";
import type { GlyphPainter } from "./glyph-painter";
import type { TiledMap } from "./tiled-map";

interface EntityGlyphsProps {
  map: TiledMap;
  glyphPainter: GlyphPainter;
  entities: readonly Entity[];
  catalog: ThingCatalog;
}

/**
 * Placed objects and ground items, drawn from each entity's glyph over the static map, so a door
 * or a dropped loaf shows where it is now. Redrawn whenever entities change.
 */
export function EntityGlyphs({ map, glyphPainter, entities, catalog }: EntityGlyphsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const placedGlyphs = useMemo(() => listPlacedGlyphs(entities, catalog), [entities, catalog]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) throw new Error("The browser could not create a 2D canvas for the village items");
    const { tileWidth, tileHeight } = map;
    context.clearRect(0, 0, map.width * tileWidth, map.height * tileHeight);
    for (const placed of placedGlyphs) {
      glyphPainter.drawGlyph(context, placed.glyph, {
        x: placed.tileX * tileWidth,
        y: placed.tileY * tileHeight,
        width: tileWidth,
        height: tileHeight,
      });
    }
  }, [map, glyphPainter, placedGlyphs]);

  return (
    <canvas
      className="village-tiles"
      ref={canvasRef}
      width={map.width * map.tileWidth}
      height={map.height * map.tileHeight}
    />
  );
}
