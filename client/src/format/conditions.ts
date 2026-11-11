import type { ActiveCondition, ConditionDefinition, Entity } from "@village/shared";

/** A condition others can see, for an overlay or the hover card. */
export interface VisibleCondition {
  name: string;
  /** How it reads ("on fire"). */
  words: string;
}

/** The conditions that show on an agent or a thing, in the order they started. */
export function listVisibleConditions(
  conditions: readonly ActiveCondition[],
  definitions: readonly ConditionDefinition[],
): VisibleCondition[] {
  return conditions.flatMap((condition) => {
    const definition = definitions.find((candidate) => candidate.name === condition.name);
    if (!definition?.isVisible) return [];
    return [{ name: condition.name, words: definition.words }];
  });
}

/** One overlay to draw over a map tile: a visible condition on a thing standing there. */
export interface TileConditionOverlay {
  key: string;
  conditionName: string;
  tileX: number;
  tileY: number;
}

/** Overlays for every entity on a tile with a visible condition (the door on fire). */
export function listTileConditionOverlays(
  entities: readonly Entity[],
  definitions: readonly ConditionDefinition[],
): TileConditionOverlay[] {
  return entities.flatMap((entity) => {
    if (entity.location.kind !== "tile") return [];
    const { pos } = entity.location;
    return listVisibleConditions(entity.state.conditions, definitions).map((condition) => ({
      key: `${entity.id}:${condition.name}`,
      conditionName: condition.name,
      tileX: pos.x,
      tileY: pos.y,
    }));
  });
}
