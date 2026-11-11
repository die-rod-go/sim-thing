import {
  isBareHanded,
  matchesAppliesTo,
  resolveEntityComponents,
  type Entity,
  type ItemCatalog,
  type ThingView,
  type Verb,
} from "@village/shared";
import type { EntityWorld } from "./entity-store";

/** Verb names are matched without regard to case or surrounding space. */
export function normalizeVerbName(name: string): string {
  return name.trim().toLowerCase();
}

/** The entity as the agent would use it: held, here on a tile, or inside something else. */
export function buildEntityView(world: EntityWorld, agentId: string, entity: Entity): ThingView {
  const { location } = entity;
  const base = {
    definitionId: entity.definitionId,
    components: resolveEntityComponents(world.items, entity),
  };
  if (location.kind === "tile") return { ...base, where: "here" };
  return { ...base, where: location.holderId === agentId ? "held" : "inside" };
}

export function listVerbsForView(world: EntityWorld, view: ThingView): Verb[] {
  return world.items.verbs.filter((verb) => matchesAppliesTo(verb, view));
}

/** Whether a walker may pass the entity by doing a verb on the way. */
export function isPassableInPassing(world: EntityWorld, entity: Entity): boolean {
  const view = buildEntityView(world, "", entity);
  return listVerbsForView(world, { ...view, where: "here" }).some((verb) => verb.isDoneInPassing);
}

/** Every verb the agent could use the entity for, in `items.json` order. */
export function listVerbsForEntity(world: EntityWorld, agentId: string, entity: Entity): Verb[] {
  return listVerbsForView(world, buildEntityView(world, agentId, entity));
}

/** Verbs that need no item, like `punch`: the ones without an `appliesTo`. */
export function listItemlessVerbs(world: EntityWorld): Verb[] {
  return world.items.verbs.filter(isBareHanded);
}

/** Verbs a walker does on the way through the entity that blocks the path. */
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
  const rollsToHit = (verb: Verb) => verb.steps.some((step) => step.step === "roll_hit");
  return [...new Set(items.verbs.filter(rollsToHit).map((verb) => verb.name))];
}
