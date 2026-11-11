import {
  compareEntityAge,
  findDefinition,
  formatEntityId,
  readComponentField,
  type Agent,
  type Entity,
  type EntityLocation,
  type EntityState,
  type ItemCatalog,
  type ItemDefinition,
  type Position,
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

/** A new entity's state from its definition's engine components. */
export function buildInitialEntityState(definition: ItemDefinition): EntityState {
  const state: EntityState = { conditions: [] };
  if (Object.hasOwn(definition.components, "durability")) state.durability = 1;
  const capacity = readComponentField(definition, "stock", "capacity");
  if (typeof capacity === "number") state.stock = capacity;
  const startsOpen = readComponentField(definition, "openable", "startsOpen");
  if (typeof startsOpen === "boolean") state.isOpen = startsOpen;
  if (Object.hasOwn(definition.components, "notes")) state.notes = [];
  return state;
}

/** Makes a new entity, taking its id from the world's counter. */
export function createEntity(
  world: EntityWorld,
  definitionId: string,
  location: EntityLocation,
  label: string | null = null,
): Entity {
  const definition = findDefinition(world.items, definitionId);
  const entity: Entity = {
    id: formatEntityId(world.nextEntityId),
    definitionId,
    label,
    location,
    state: buildInitialEntityState(definition),
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

/** Everything the agent carries, oldest first. */
export function listHeldEntities(world: EntityWorld, agentId: string): Entity[] {
  return world.entities
    .filter((entity) => entity.location.kind === "inventory" && entity.location.agentId === agentId)
    .sort(compareEntityAge);
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
 * Where the entity is in the world: its own tile, its holder's tile, or its container's. Null for
 * one whose holder or container no longer exists.
 */
export function resolveEntityPosition(world: EntityWorld, entity: Entity): EntityPosition | null {
  const { location } = entity;
  if (location.kind === "tile") return { place: location.place, pos: location.pos };
  if (location.kind === "inventory") {
    const holder = world.agents.find((agent) => agent.id === location.agentId);
    return holder ? { place: holder.place, pos: holder.pos } : null;
  }
  const container = findEntityIfPresent(world, location.containerId);
  return container ? resolveEntityPosition(world, container) : null;
}

/** "bakery door" for a labelled map object, otherwise the definition's name ("bread"). */
export function describeEntityName(world: EntityWorld, entity: Entity): string {
  return entity.label ?? getDefinition(world, entity).name;
}

/** Saved entities whose definition `items.json` no longer has. */
export function findOrphanedEntities(entities: readonly Entity[], items: ItemCatalog): Entity[] {
  return entities.filter((entity) => !items.definitionsById.has(entity.definitionId));
}
