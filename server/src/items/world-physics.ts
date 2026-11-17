import { matchesThing, resolveEntityComponents, type Entity, type Matcher } from "@village/shared";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { findEntityIfPresent, isHeldBy, type EntityWorld } from "./entity-store";
import { locateThing, refThingById, viewThing, type ThingRef } from "./things";

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

/** Whether a creature catches the eye as it comes into view, so it gives a decision. */
export function isNoticedOnSight(world: EntityWorld, entity: Entity): boolean {
  return matchesEntity(world, entity, world.items.world.noticeOnSight);
}

/** Whether a place's listing in "Places you know" leaves the entity out. */
export function isOmittedFromPlaceListing(world: EntityWorld, entity: Entity): boolean {
  return matchesEntity(world, entity, world.items.world.placeListingOmits);
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
function hidesContents(world: EntityWorld, thing: ThingRef): boolean {
  const matcher = world.items.world.contentsHiddenBy;
  const view = viewThing(world, thing);
  return matcher !== undefined && view !== null && matchesThing(matcher, view);
}

function isWithinContentsReach(world: EntityWorld, agentId: string, thing: ThingRef): boolean {
  const agentPosition = locateThing(world, { kind: "agent", agentId });
  const position = locateThing(world, thing);
  if (agentPosition === null || position === null) return false;
  if (position.place !== agentPosition.place) return false;
  const distance = computeChebyshevDistance(agentPosition.pos, position.pos);
  return distance <= config.perception.contentsReachTiles;
}

/** Whether the agent sees into the thing, and if not, whether it is hidden or only too far off. */
export type InsideView = "seen" | "hidden" | "too_far";

export function judgeInsideView(world: EntityWorld, agentId: string, thing: ThingRef): InsideView {
  if (canSeeInto(world, agentId, thing)) return "seen";
  return hidesContents(world, thing) ? "hidden" : "too_far";
}

/**
 * Whether the agent sees what is directly inside the thing: it is the agent's own body, or the
 * agent holds it or stands close to it, and the world's `contentsHiddenBy` doesn't match it. Every
 * holder on the way down must pass the same test.
 */
export function canSeeInto(world: EntityWorld, agentId: string, thing: ThingRef): boolean {
  if (thing.kind === "agent" && thing.agentId === agentId) return true;
  if (hidesContents(world, thing)) return false;
  if (thing.kind === "entity") {
    const entity = findEntityIfPresent(world, thing.entityId);
    if (!entity) return false;
    if (isHeldBy(entity, agentId)) return true;
    const { location } = entity;
    const holder = location.kind === "inside" ? refThingById(location.holderId) : null;
    if (holder !== null && !canSeeInto(world, agentId, holder)) return false;
  }
  return isWithinContentsReach(world, agentId, thing);
}
