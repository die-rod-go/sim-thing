import { compareEntityAge, readComponentField, type Entity } from "@village/shared";
import { findEntityIfPresent, getDefinition, type EntityWorld } from "./entity-store";

/** What is inside a container, oldest first. */
export function listContents(world: EntityWorld, containerId: string): Entity[] {
  return world.entities
    .filter(
      (entity) => entity.location.kind === "inside" && entity.location.containerId === containerId,
    )
    .sort(compareEntityAge);
}

/** How many things the container holds at most; null for something that isn't a container. */
export function readContainerCapacity(world: EntityWorld, entity: Entity): number | null {
  const capacity = readComponentField(getDefinition(world, entity), "container", "capacity");
  return typeof capacity === "number" ? capacity : null;
}

/** Whether the entity is inside the container, directly or inside something within it. */
export function isNestedIn(world: EntityWorld, entity: Entity, containerId: string): boolean {
  let location = entity.location;
  const visited = new Set<string>();
  while (location.kind === "inside" && !visited.has(location.containerId)) {
    if (location.containerId === containerId) return true;
    visited.add(location.containerId);
    const holder = findEntityIfPresent(world, location.containerId);
    if (!holder) return false;
    location = holder.location;
  }
  return false;
}
