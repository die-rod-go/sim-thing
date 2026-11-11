import {
  parseComponentPath,
  resolveThingComponents,
  type ComponentChanges,
  type FieldValue,
  type ResolvedComponents,
  type ThingView,
  type WorldEvent,
} from "@village/shared";
import { computeChebyshevDistance } from "../economy/give";
import { describeBodyName, isDead } from "../status/health";
import { createEvent, type EventFields } from "../sim/event-factory";
import { takeNextEventId, type WorldState } from "../sim/world-state";
import {
  describeEntityName,
  findEntityIfPresent,
  resolveEntityPosition,
  type EntityPosition,
  type EntityWorld,
} from "./entity-store";

/*
 * A thing is an entity or an agent's body. This module is the only item code that branches on
 * which one it is: everything else reads components, places and names through it.
 */

export type ThingRef = { kind: "entity"; entityId: string } | { kind: "agent"; agentId: string };

function findAgentIfPresent(world: EntityWorld, agentId: string) {
  return world.agents.find((agent) => agent.id === agentId);
}

/** How the thing differs from its definition; null when it no longer exists. */
export function readThingChanges(world: EntityWorld, thing: ThingRef): ComponentChanges | null {
  if (thing.kind === "agent") return findAgentIfPresent(world, thing.agentId)?.bodyChanges ?? null;
  return findEntityIfPresent(world, thing.entityId)?.changes ?? null;
}

/** The thing's definition id: an entity's own, or the world's `agentBody` for a body. */
export function findThingDefinitionId(world: EntityWorld, thing: ThingRef): string | null {
  if (thing.kind === "agent") {
    return findAgentIfPresent(world, thing.agentId) ? world.items.world.agentBody : null;
  }
  return findEntityIfPresent(world, thing.entityId)?.definitionId ?? null;
}

/** The components the thing has right now; null when it no longer exists. */
export function readComponents(world: EntityWorld, thing: ThingRef): ResolvedComponents | null {
  const changes = readThingChanges(world, thing);
  const definitionId = findThingDefinitionId(world, thing);
  if (changes === null || definitionId === null) return null;
  return resolveThingComponents(world.items, definitionId, changes);
}

export function hasComponent(world: EntityWorld, thing: ThingRef, component: string): boolean {
  const components = readComponents(world, thing);
  return components !== null && Object.hasOwn(components, component);
}

/** A field by its component path ("health.current"); undefined when the thing lacks it. */
export function readField(
  world: EntityWorld,
  thing: ThingRef,
  componentPath: string,
): FieldValue | undefined {
  const path = parseComponentPath(componentPath);
  if (path === null) throw new Error(`Bad component path "${componentPath}"`);
  return readComponents(world, thing)?.[path.component]?.[path.field];
}

/** A number field, or null when the thing lacks it. */
export function readNumberField(
  world: EntityWorld,
  thing: ThingRef,
  componentPath: string,
): number | null {
  const value = readField(world, thing, componentPath);
  return typeof value === "number" ? value : null;
}

/** The thing as matchers see it; null when it no longer exists. */
export function viewThing(world: EntityWorld, thing: ThingRef): ThingView | null {
  const components = readComponents(world, thing);
  const definitionId = findThingDefinitionId(world, thing);
  return components === null || definitionId === null ? null : { definitionId, components };
}

/** Where the thing is; a carried or contained entity is where its outermost holder is. */
export function locateThing(world: EntityWorld, thing: ThingRef): EntityPosition | null {
  if (thing.kind === "agent") {
    const agent = findAgentIfPresent(world, thing.agentId);
    return agent ? { place: agent.place, pos: agent.pos } : null;
  }
  const entity = findEntityIfPresent(world, thing.entityId);
  return entity ? resolveEntityPosition(world, entity) : null;
}

export function isSameThing(first: ThingRef, second: ThingRef): boolean {
  if (first.kind === "agent") return second.kind === "agent" && first.agentId === second.agentId;
  return second.kind === "entity" && first.entityId === second.entityId;
}

/** Every thing in a fixed order: agents (the dead too) in their order, then entities by id. */
export function listThings(world: EntityWorld): ThingRef[] {
  return [
    ...world.agents.map((agent): ThingRef => ({ kind: "agent", agentId: agent.id })),
    ...world.entities.map((entity): ThingRef => ({ kind: "entity", entityId: entity.id })),
  ];
}

/** Every agent (the dead too) and entity within `radius` tiles of `center`, agents first. */
export function listThingsWithin(
  world: EntityWorld,
  center: EntityPosition,
  radius: number,
): ThingRef[] {
  return listThings(world).filter((thing) => {
    const position = locateThing(world, thing);
    return position !== null && computeChebyshevDistance(center.pos, position.pos) <= radius;
  });
}

/** "the bakery door", "Mara's body", or the agent's name. */
export function describeThingName(world: EntityWorld, thing: ThingRef): string {
  if (thing.kind === "agent") {
    const agent = findAgentIfPresent(world, thing.agentId);
    if (!agent) return "someone";
    return isDead(agent) ? describeBodyName(agent.name) : agent.name;
  }
  const entity = findEntityIfPresent(world, thing.entityId);
  return entity ? `the ${describeEntityName(world, entity)}` : "something";
}

/**
 * An event whose subject is the given thing. A living agent acts and remembers it; a thing or a
 * body is only seen. Null for a thing that is no longer anywhere.
 */
export function createThingEvent(
  state: WorldState,
  thing: ThingRef,
  fields: EventFields,
): WorldEvent | null {
  if (thing.kind === "agent") {
    const agent = findAgentIfPresent(state, thing.agentId);
    if (agent && !isDead(agent)) return createEvent(state, agent, fields);
  }
  const position = locateThing(state, thing);
  if (position === null) return null;
  return {
    id: takeNextEventId(state),
    tick: state.tick,
    actorId: thing.kind === "agent" ? thing.agentId : thing.entityId,
    actorName: describeThingName(state, thing),
    kind: fields.kind,
    targetId: fields.targetId ?? null,
    targetName: fields.targetName ?? null,
    place: position.place,
    pos: { ...position.pos },
    description: fields.description,
    loudness: fields.loudness ?? null,
    isActorThing: true,
  };
}
