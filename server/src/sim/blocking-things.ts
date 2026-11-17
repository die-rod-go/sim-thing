import {
  buildDefinitionNamer,
  listComponentWords,
  resolveEntityComponents,
  type Entity,
} from "@village/shared";
import { config } from "../config";
import { describeEntityName } from "../items/entity-store";
import { isPassableInPassing } from "../items/verb-offers";
import { blocksMovement } from "../items/world-physics";
import { tileIndex } from "../world/types";
import type { WorldState } from "./world-state";

/** "the bakery door is closed and locked": why a walker can't get past the thing. */
export function describeBlockingThing(state: WorldState, blocker: Entity): string {
  const words = listComponentWords(
    state.items.declarations,
    resolveEntityComponents(state.items, blocker),
    true,
    buildDefinitionNamer(state.items),
  );
  const texts = config.walking.blockingThingWords;
  const template = words.length > 0 ? texts.withState : texts.plain;
  return template
    .split("{thing}")
    .join(describeEntityName(state, blocker))
    .split("{state}")
    .join(words.join(texts.stateJoiner));
}

/** Things on tiles that stop a walker and that it can't deal with in passing, by tile index. */
export function listImpassableThings(state: WorldState): Map<number, Entity> {
  const things = new Map<number, Entity>();
  for (const entity of state.entities) {
    if (entity.location.kind !== "tile") continue;
    if (!blocksMovement(state, entity) || isPassableInPassing(state, entity)) continue;
    const index = tileIndex(state.map.grid, entity.location.pos);
    if (!things.has(index)) things.set(index, entity);
  }
  return things;
}
