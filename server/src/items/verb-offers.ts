import {
  isEntityId,
  isBareHanded,
  matchesAppliesTo,
  resolveBodyComponents,
  resolveEntityComponents,
  type Agent,
  type Entity,
  type ItemCatalog,
  type ThingView,
  type Verb,
} from "@village/shared";
import { isDead } from "../status/health";
import type { EntityWorld } from "./entity-store";

/** Verb names are matched without regard to case or surrounding space. */
export function normalizeVerbName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The entity as the agent would use it: held, here on a tile, or inside something. Null when
 * someone else carries it, since nobody can use what another agent holds.
 */
export function buildEntityView(
  world: EntityWorld,
  agentId: string,
  entity: Entity,
): ThingView | null {
  const { location } = entity;
  const base = {
    definitionId: entity.definitionId,
    components: resolveEntityComponents(world.items, entity),
  };
  if (location.kind === "tile") return { ...base, where: "here" };
  if (isEntityId(location.holderId)) return { ...base, where: "inside" };
  return location.holderId === agentId ? { ...base, where: "held" } : null;
}

export function listVerbsForView(world: EntityWorld, view: ThingView): Verb[] {
  return world.items.verbs.filter((verb) => matchesAppliesTo(verb, view));
}

/** Whether a walker may pass the entity by doing a verb on the way (opening a door). */
export function isPassableInPassing(world: EntityWorld, entity: Entity): boolean {
  const view = buildEntityView(world, "", entity);
  if (view === null) return false;
  return listVerbsForView(world, { ...view, where: "here" }).some((verb) => verb.isDoneInPassing);
}

/** Every verb the agent could use the entity for, in `items.json` order. */
export function listVerbsForEntity(world: EntityWorld, agentId: string, entity: Entity): Verb[] {
  const view = buildEntityView(world, agentId, entity);
  return view === null ? [] : listVerbsForView(world, view);
}

/** Verbs that need no item, like `punch`: the ones without an `appliesTo`. */
export function listItemlessVerbs(world: EntityWorld, _user: Agent): Verb[] {
  return world.items.verbs.filter(isBareHanded);
}

/** Verbs a dead agent's body offers, like `take`; none while the agent lives. */
export function listVerbsForBody(world: EntityWorld, body: Agent): Verb[] {
  if (!isDead(body)) return [];
  return listVerbsForView(world, {
    definitionId: world.items.world.agentBody,
    components: resolveBodyComponents(world.items, body),
    where: "here",
  });
}

/** Verbs a walker does on the way through the entity that blocks the path (opening a door). */
export function listVerbsDoneInPassing(
  world: EntityWorld,
  walkerId: string,
  entity: Entity,
): Verb[] {
  return listVerbsForEntity(world, walkerId, entity).filter((verb) => verb.isDoneInPassing);
}

export function findVerbByName(verbs: readonly Verb[], name: string): Verb | undefined {
  const wanted = normalizeVerbName(name);
  return verbs.find((verb) => normalizeVerbName(verb.name) === wanted);
}

/** The names of verbs that make a hit roll (attacks). */
export function listHitRollVerbNames(items: ItemCatalog): string[] {
  return [
    ...new Set(items.verbs.filter((verb) => verb.hitRoll !== undefined).map((verb) => verb.name)),
  ];
}
