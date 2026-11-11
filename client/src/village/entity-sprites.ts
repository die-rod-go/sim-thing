import type { Entity, ItemDefinition } from "@village/shared";

/** One sprite to draw: a tile of the map's tileset at a map tile. */
export interface PlacedSprite {
  entityId: string;
  /** The tile's index in the tileset, counted from 0. */
  tile: number;
  tileX: number;
  tileY: number;
}

/**
 * Every entity standing on a tile (placed objects and items on the ground), drawn from its
 * definition's sprite. Carried and contained entities aren't on the map. Placed objects come
 * first, so a knife dropped by the card table is drawn on top of it.
 */
export function listPlacedSprites(
  entities: readonly Entity[],
  definitions: readonly ItemDefinition[],
): PlacedSprite[] {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const onTiles = entities.flatMap((entity) => {
    const definition = definitionsById.get(entity.definitionId);
    if (entity.location.kind !== "tile" || !definition) return [];
    const { pos } = entity.location;
    const sprite = {
      entityId: entity.id,
      tile: definition.sprite.tile,
      tileX: pos.x,
      tileY: pos.y,
    };
    return [{ sprite, isPlaced: definition.form === "placeable" }];
  });
  return [
    ...onTiles.filter((entry) => entry.isPlaced),
    ...onTiles.filter((entry) => !entry.isPlaced),
  ].map((entry) => entry.sprite);
}
