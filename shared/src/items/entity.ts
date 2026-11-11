import type { Note, Position } from "../types";

/** Where an entity is. Carried and contained entities are wherever their holder or container is. */
export type EntityLocation =
  | { kind: "inventory"; agentId: string }
  | { kind: "tile"; place: string; pos: Position }
  | { kind: "inside"; containerId: string };

/** A timed state on an agent or entity (burning, bleeding). */
export interface ActiveCondition {
  name: string;
  /** Null: lasts until something removes it. */
  endsAtTick: number | null;
  /** Who caused it, for death causes. */
  sourceAgentId: string | null;
}

export interface EntityState {
  durability?: number;
  stock?: number;
  isOpen?: boolean;
  notes?: Note[];
  /** Agents using it right now, e.g. players at the card table. */
  userIds?: string[];
  conditions: ActiveCondition[];
}

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
  state: EntityState;
}

const ENTITY_ID_PREFIX = "entity-";

export function formatEntityId(counter: number): string {
  return `${ENTITY_ID_PREFIX}${counter}`;
}

function readEntityNumber(entityId: string): number {
  return Number(entityId.slice(ENTITY_ID_PREFIX.length));
}

/** Oldest first: entities made earlier have lower counter values. */
export function compareEntityAge(first: Entity, second: Entity): number {
  return readEntityNumber(first.id) - readEntityNumber(second.id);
}
