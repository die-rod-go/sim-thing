import {
  compareEntityAge,
  findDefinition,
  formatEntityId,
  isDirectlyInside,
  isEntityId,
  type Agent,
  type Entity,
  type EntityLocation,
  type ItemCatalog,
  type ItemDefinition,
  type Position,
  type ThingId,
} from "@village/shared";

/** The part of the world state the entity store reads and writes. */
export interface EntityWorld {
  agents: Agent[];
  entities: Entity[];
  /** The counter the next entity's id comes from. */
  nextEntityId: number;
  items: ItemCatalog;
}

export interface EntityPosition {
  place: string;
  pos: Position;
}

export function findEntity(world: EntityWorld, entityId: string): Entity {
  const entity = world.entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error(`Unknown entity "${entityId}"`);
  return entity;
}

/** Undefined once the entity is gone (eaten, destroyed). */
export function findEntityIfPresent(world: EntityWorld, entityId: string): Entity | undefined {
  return world.entities.find((candidate) => candidate.id === entityId);
}

export function replaceEntity(world: EntityWorld, updated: Entity): void {
  const index = world.entities.findIndex((candidate) => candidate.id === updated.id);
  if (index === -1) throw new Error(`Unknown entity "${updated.id}"`);
  world.entities[index] = updated;
}

export function removeEntity(world: EntityWorld, entityId: string): void {
  findEntity(world, entityId);
  world.entities = world.entities.filter((candidate) => candidate.id !== entityId);
}

export function getDefinition(world: EntityWorld, entity: Entity): ItemDefinition {
  return findDefinition(world.items, entity.definitionId);
}

/** Makes a new entity, untouched, taking its id from the world's counter. */
export function createEntity(
  world: EntityWorld,
  definitionId: string,
  location: EntityLocation,
  label: string | null = null,
): Entity {
  findDefinition(world.items, definitionId);
  const entity: Entity = {
    id: formatEntityId(world.nextEntityId),
    definitionId,
    label,
    location,
    changes: {},
  };
  world.nextEntityId += 1;
  world.entities.push(entity);
  return entity;
}

export function moveEntity(world: EntityWorld, entityId: string, location: EntityLocation): Entity {
  const moved = { ...findEntity(world, entityId), location };
  replaceEntity(world, moved);
  return moved;
}

/** Inside the agent's body: where carried things go. */
export function locateInside(holderId: ThingId): EntityLocation {
  return { kind: "inside", holderId };
}

/** What is directly inside the thing (a chest's contents, an agent's belongings), oldest first. */
export function listContents(world: EntityWorld, holderId: ThingId): Entity[] {
  return world.entities
    .filter((entity) => isDirectlyInside(entity, holderId))
    .sort(compareEntityAge);
}

/** Everything the agent carries, oldest first. */
export function listHeldEntities(world: EntityWorld, agentId: string): Entity[] {
  return listContents(world, agentId);
}

export function isHeldBy(entity: Entity, agentId: string): boolean {
  return isDirectlyInside(entity, agentId);
}

/** Whether another agent than this one carries the entity. */
export function isHeldByOther(entity: Entity, agentId: string): boolean {
  const { location } = entity;
  return (
    location.kind === "inside" && !isEntityId(location.holderId) && location.holderId !== agentId
  );
}

export function listHeldOfDefinition(
  world: EntityWorld,
  agentId: string,
  definitionId: string,
): Entity[] {
  return listHeldEntities(world, agentId).filter((entity) => entity.definitionId === definitionId);
}

export function countHeld(world: EntityWorld, agentId: string, definitionId: string): number {
  return listHeldOfDefinition(world, agentId, definitionId).length;
}

/** Entities standing on tiles of the place: placed objects and items on the ground. */
export function listTileEntitiesAt(world: EntityWorld, place: string): Entity[] {
  return world.entities.filter(
    (entity) => entity.location.kind === "tile" && entity.location.place === place,
  );
}

/**
 * Where the entity is in the world: its own tile, or where its outermost holder is. Null for one
 * whose holder no longer exists.
 */
export function resolveEntityPosition(world: EntityWorld, entity: Entity): EntityPosition | null {
  const visited = new Set<string>();
  let current = entity;
  while (current.location.kind === "inside") {
    const { holderId } = current.location;
    if (visited.has(holderId)) return null;
    visited.add(holderId);
    if (!isEntityId(holderId)) {
      const holder = world.agents.find((agent) => agent.id === holderId);
      return holder ? { place: holder.place, pos: holder.pos } : null;
    }
    const container = findEntityIfPresent(world, holderId);
    if (!container) return null;
    current = container;
  }
  return { place: current.location.place, pos: current.location.pos };
}

/** Whether the entity is inside the holder, directly or inside something within it. */
export function isNestedIn(world: EntityWorld, entity: Entity, holderId: ThingId): boolean {
  let location = entity.location;
  const visited = new Set<string>();
  while (location.kind === "inside" && !visited.has(location.holderId)) {
    if (location.holderId === holderId) return true;
    visited.add(location.holderId);
    const holder = findEntityIfPresent(world, location.holderId);
    if (!holder) return false;
    location = holder.location;
  }
  return false;
}

/** "bakery door" for a labelled map object, otherwise the definition's name ("bread"). */
export function describeEntityName(world: EntityWorld, entity: Entity): string {
  return entity.label ?? getDefinition(world, entity).name;
}

/** Saved entities whose definition `items.json` no longer has. */
export function findOrphanedEntities(entities: readonly Entity[], items: ItemCatalog): Entity[] {
  return entities.filter((entity) => !items.definitionsById.has(entity.definitionId));
}
