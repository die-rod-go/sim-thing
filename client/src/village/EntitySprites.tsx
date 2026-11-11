import { useEffect, useMemo, useRef } from "react";
import type { Entity, ItemDefinition } from "@village/shared";
import { listPlacedSprites } from "./entity-sprites";
import { findTileSourceRect, type TiledMap } from "./tiled-map";

interface EntitySpritesProps {
  map: TiledMap;
  tilesetImage: HTMLImageElement;
  entities: readonly Entity[];
  definitions: readonly ItemDefinition[];
}

/**
 * Placed objects and ground items, drawn from each entity's sprite over the static map, so a door
 * or a dropped loaf shows where it is now. Redrawn whenever entities change.
 */
export function EntitySprites({ map, tilesetImage, entities, definitions }: EntitySpritesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sprites = useMemo(() => listPlacedSprites(entities, definitions), [entities, definitions]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) throw new Error("The browser could not create a 2D canvas for the village items");
    const { tileWidth, tileHeight } = map;
    context.clearRect(0, 0, map.width * tileWidth, map.height * tileHeight);
    for (const sprite of sprites) {
      const source = findTileSourceRect(map, map.tileset.firstGid + sprite.tile);
      if (!source) continue;
      context.drawImage(
        tilesetImage,
        source.x,
        source.y,
        tileWidth,
        tileHeight,
        sprite.tileX * tileWidth,
        sprite.tileY * tileHeight,
        tileWidth,
        tileHeight,
      );
    }
  }, [map, tilesetImage, sprites]);

  return (
    <canvas
      className="village-tiles"
      ref={canvasRef}
      width={map.width * map.tileWidth}
      height={map.height * map.tileHeight}
    />
  );
}
