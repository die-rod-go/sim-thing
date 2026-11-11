import {
  isEntityId,
  matchesRule,
  resolveBodyComponents,
  resolveEntityComponents,
  type Agent,
  type Entity,
  type ItemCatalog,
  type RuleSubject,
  type Verb,
} from "@village/shared";
import { isDead } from "../status/health";
import type { EntityWorld } from "./entity-store";
import { isLyingWhenOnTile } from "./world-physics";

/** Verb names are matched without regard to case or surrounding space. */
export function normalizeVerbName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The entity as the agent would use it: held, on the ground, placed, or inside something. Null when
 * someone else carries it, since nobody can use what another agent holds.
 */
export function buildEntitySubject(
  world: EntityWorld,
  agentId: string,
  entity: Entity,
): RuleSubject | null {
  const { location } = entity;
  const base = {
    kind: "entity" as const,
    definitionId: entity.definitionId,
    components: resolveEntityComponents(world.items, entity),
  };
  if (location.kind === "inside") {
    if (isEntityId(location.holderId)) return { ...base, location: "inside" };
    return location.holderId === agentId ? { ...base, location: "held" } : null;
  }
  return { ...base, location: isLyingWhenOnTile(world, entity) ? "ground" : "placed" };
}

/** Whether a walker may pass the entity by doing a verb on the way (opening a door). */
export function isPassableInPassing(world: EntityWorld, entity: Entity): boolean {
  const subject = buildEntitySubject(world, "", entity);
  return (
    subject !== null && listVerbsForSubject(world, subject).some((verb) => verb.isDoneInPassing)
  );
}

export function listVerbsForSubject(world: EntityWorld, subject: RuleSubject): Verb[] {
  return world.items.verbs.filter((verb) => matchesRule(verb.appliesTo, subject));
}

/** Every verb the agent could use the entity for, in `items.json` order. */
export function listVerbsForEntity(world: EntityWorld, agentId: string, entity: Entity): Verb[] {
  const subject = buildEntitySubject(world, agentId, entity);
  return subject === null ? [] : listVerbsForSubject(world, subject);
}

/** Verbs that need no item, like `punch`: their rule matches the user's body. */
export function listItemlessVerbs(world: EntityWorld, user: Agent): Verb[] {
  return listVerbsForSubject(world, {
    kind: "user",
    components: resolveBodyComponents(world.items, user),
  });
}

/** Verbs a dead agent's body offers, like `take`; none while the agent lives. */
export function listVerbsForBody(world: EntityWorld, body: Agent): Verb[] {
  if (!isDead(body)) return [];
  return listVerbsForSubject(world, {
    kind: "dead_agent",
    components: resolveBodyComponents(world.items, body),
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
