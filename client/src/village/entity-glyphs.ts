import type { Entity, Glyph, ItemDefinition } from "@village/shared";

/** One glyph to draw at a map tile, for an entity standing there. */
export interface PlacedGlyph {
  entityId: string;
  glyph: Glyph;
  tileX: number;
  tileY: number;
}

/**
 * Every entity standing on a tile (placed objects and items on the ground), drawn from its
 * definition's glyph. Carried and contained entities aren't on the map. Placed objects come
 * first, so a knife dropped by the card table is drawn on top of it.
 */
export function listPlacedGlyphs(
  entities: readonly Entity[],
  definitions: readonly ItemDefinition[],
): PlacedGlyph[] {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const onTiles = entities.flatMap((entity) => {
    const definition = definitionsById.get(entity.definitionId);
    if (entity.location.kind !== "tile" || !definition) return [];
    const { pos } = entity.location;
    const placedGlyph = {
      entityId: entity.id,
      glyph: definition.glyph,
      tileX: pos.x,
      tileY: pos.y,
    };
    return [{ placedGlyph, isPlaced: definition.form === "placeable" }];
  });
  return [
    ...onTiles.filter((entry) => entry.isPlaced),
    ...onTiles.filter((entry) => !entry.isPlaced),
  ].map((entry) => entry.placedGlyph);
}
