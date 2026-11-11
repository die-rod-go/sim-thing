import { matchesThing, resolveEntityComponents, type Entity, type Matcher } from "@village/shared";
import type { EntityWorld } from "./entity-store";
import { viewThing, type ThingRef } from "./things";

/*
 * What the world settings in `items.json` make of an entity: whether it stops sight, walking or
 * sound, and how it reads when carried or lying about. Nothing else in the server asks what an
 * entity "is"; it asks these.
 */

function matchesEntity(world: EntityWorld, entity: Entity, matcher: Matcher | undefined): boolean {
  if (matcher === undefined) return false;
  return matchesThing(matcher, {
    definitionId: entity.definitionId,
    components: resolveEntityComponents(world.items, entity),
  });
}

function matchesWhileOnTile(
  world: EntityWorld,
  entity: Entity,
  matcher: Matcher | undefined,
): boolean {
  return entity.location.kind === "tile" && matchesEntity(world, entity, matcher);
}

export function blocksSight(world: EntityWorld, entity: Entity): boolean {
  return matchesWhileOnTile(world, entity, world.items.world.sightBlockedBy);
}

export function blocksMovement(world: EntityWorld, entity: Entity): boolean {
  return matchesWhileOnTile(world, entity, world.items.world.movementBlockedBy);
}

export function mufflesSound(world: EntityWorld, entity: Entity): boolean {
  return matchesWhileOnTile(world, entity, world.items.world.soundMuffledBy);
}

/** Whether others see the entity when an agent carries it ("Tobias, carrying a knife"). */
export function isShownWhenCarried(world: EntityWorld, entity: Entity): boolean {
  return matchesEntity(world, entity, world.items.world.shownWhenCarried);
}

/** Whether the entity reads as lying on the floor or ground, not standing where it was placed. */
export function isLyingWhenOnTile(world: EntityWorld, entity: Entity): boolean {
  return matchesEntity(world, entity, world.items.world.lyingWhenOnTile);
}

/** Whether nobody but its own agent sees what is inside the thing (a living person's pockets). */
export function hidesContents(world: EntityWorld, thing: ThingRef): boolean {
  const matcher = world.items.world.contentsHiddenBy;
  const view = viewThing(world, thing);
  return matcher !== undefined && view !== null && matchesThing(matcher, view);
}
