import {
  matchesRule,
  type Entity,
  type ItemCatalog,
  type RuleSubject,
  type Verb,
} from "@village/shared";
import { getDefinition, type EntityWorld } from "./entity-store";

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
  const definition = getDefinition(world, entity);
  const { location } = entity;
  if (location.kind === "inventory") {
    return location.agentId === agentId ? { kind: "entity", definition, location: "held" } : null;
  }
  if (location.kind === "inside") return { kind: "entity", definition, location: "inside" };
  const placement = definition.form === "placeable" ? "placed" : "ground";
  return { kind: "entity", definition, location: placement };
}

export function listVerbsForSubject(world: EntityWorld, subject: RuleSubject): Verb[] {
  return world.items.verbs.filter((verb) => matchesRule(verb.appliesTo, subject));
}

/** Every verb the agent could use the entity for, in `items.json` order. */
export function listVerbsForEntity(world: EntityWorld, agentId: string, entity: Entity): Verb[] {
  const subject = buildEntitySubject(world, agentId, entity);
  return subject === null ? [] : listVerbsForSubject(world, subject);
}

/** Verbs that need no item, like `punch`: their rule matches the user. */
export function listItemlessVerbs(world: EntityWorld): Verb[] {
  return listVerbsForSubject(world, { kind: "user", properties: world.items.personProperties });
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
