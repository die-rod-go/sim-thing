import {
  matchesThing,
  resolveEntityComponents,
  type Entity,
  type Glyph,
  type ThingCatalog,
} from "@village/shared";

/** One glyph to draw at a map tile, for an entity standing there. */
export interface PlacedGlyph {
  entityId: string;
  glyph: Glyph;
  tileX: number;
  tileY: number;
}

/** Whether the world settings say this entity lies loose on a tile (a dropped knife, not an oven). */
export function isLyingOnTile(catalog: ThingCatalog, entity: Entity): boolean {
  const matcher = catalog.world.lyingWhenOnTile;
  return (
    matcher !== undefined &&
    matchesThing(matcher, {
      definitionId: entity.definitionId,
      components: resolveEntityComponents(catalog, entity),
    })
  );
}

/**
 * Every entity standing on a tile (placed objects and items on the ground), drawn from its
 * definition's glyph. Carried and contained entities aren't on the map. Placed objects come
 * first, so a knife dropped by the card table is drawn on top of it.
 */
export function listPlacedGlyphs(
  entities: readonly Entity[],
  catalog: ThingCatalog,
): PlacedGlyph[] {
  const onTiles = entities.flatMap((entity) => {
    const definition = catalog.definitionsById.get(entity.definitionId);
    if (entity.location.kind !== "tile" || !definition) return [];
    const { pos } = entity.location;
    const placedGlyph = {
      entityId: entity.id,
      glyph: definition.glyph,
      tileX: pos.x,
      tileY: pos.y,
    };
    return [{ placedGlyph, isLying: isLyingOnTile(catalog, entity) }];
  });
  return [
    ...onTiles.filter((entry) => !entry.isLying),
    ...onTiles.filter((entry) => entry.isLying),
  ].map((entry) => entry.placedGlyph);
}
