import {
  matchesThing,
  resolveEntityComponents,
  type Entity,
  type Instinct,
  type ThingView,
} from "@village/shared";
import { findEntityIfPresent } from "../../items/entity-store";
import type { WorldState } from "../world-state";

/*
 * A creature is an entity some instinct applies to. Code here only reads which instincts apply;
 * what they make the creature do is in `items.json`.
 */

/** The creature as its own instincts and verbs meet it: itself. */
export function viewCreatureAsSelf(state: WorldState, entity: Entity): ThingView {
  return {
    definitionId: entity.definitionId,
    components: resolveEntityComponents(state.items, entity),
    where: "self",
  };
}

/** Its instincts in `items.json` order, which is the order it tries them in. */
export function listApplicableInstincts(state: WorldState, entity: Entity): Instinct[] {
  const view = viewCreatureAsSelf(state, entity);
  return state.items.file.instincts.filter((instinct) => matchesThing(instinct.appliesTo, view));
}

/** A creature acts only while it stands on a tile: one carried or put away does nothing. */
export function isCreature(state: WorldState, entity: Entity): boolean {
  return entity.location.kind === "tile" && listApplicableInstincts(state, entity).length > 0;
}

export function isCreatureId(state: WorldState, entityId: string): boolean {
  const entity = findEntityIfPresent(state, entityId);
  return entity !== undefined && isCreature(state, entity);
}

export function listCreatures(state: WorldState): Entity[] {
  if (state.items.file.instincts.length === 0) return [];
  return state.entities.filter((entity) => isCreature(state, entity));
}
