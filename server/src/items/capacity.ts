import type { Entity } from "@village/shared";
import type { EntityWorld } from "./entity-store";
import { readNumberField } from "./things";

/** Transitional: containers hold what this field allows, until later phases make it data. */
export const CAPACITY_FIELD = "capacity.max";

/** How many things the entity holds at most; null for something that isn't a container. */
export function readContainerCapacity(world: EntityWorld, entity: Entity): number | null {
  return readNumberField(world, { kind: "entity", entityId: entity.id }, CAPACITY_FIELD);
}
