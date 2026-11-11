import type { Position } from "../types";
import type { ComponentChanges } from "./components";

/**
 * `entity-12` or an agent's id. The two never collide: seed validation rejects an agent id that
 * starts with `entity-`.
 */
export type ThingId = string;

/** Where an entity is: on a tile, or inside another thing (an entity, or an agent's body). */
export type EntityLocation =
  { kind: "tile"; place: string; pos: Position } | { kind: "inside"; holderId: ThingId };

/** One instance of an item definition in the world. */
export interface Entity {
  /** From a counter in the world state, so runs reproduce; a higher number is a newer entity. */
  id: string;
  definitionId: string;
  /**
   * The name a map gives a placed entity ("bakery door"), so several beds can be told apart. Null
   * for everything else, which goes by its definition's name.
   */
  label: string | null;
  location: EntityLocation;
  /** Where its components differ from its definition's. Empty for an untouched entity. */
  changes: ComponentChanges;
}

export const ENTITY_ID_PREFIX = "entity-";

export function formatEntityId(counter: number): string {
  return `${ENTITY_ID_PREFIX}${counter}`;
}

/** Whether a thing id names an entity rather than an agent's body. */
export function isEntityId(thingId: ThingId): boolean {
  return thingId.startsWith(ENTITY_ID_PREFIX);
}

function readEntityNumber(entityId: string): number {
  return Number(entityId.slice(ENTITY_ID_PREFIX.length));
}

/** Oldest first: entities made earlier have lower counter values. */
export function compareEntityAge(first: Entity, second: Entity): number {
  return readEntityNumber(first.id) - readEntityNumber(second.id);
}

/** Whether the entity is directly inside the thing: what a chest, or an agent, holds. */
export function isDirectlyInside(entity: Entity, holderId: ThingId): boolean {
  return entity.location.kind === "inside" && entity.location.holderId === holderId;
}

/** The agent carrying the entity directly, or null when it is on a tile or inside an entity. */
export function findCarrierId(entity: Entity): string | null {
  const { location } = entity;
  return location.kind === "inside" && !isEntityId(location.holderId) ? location.holderId : null;
}
