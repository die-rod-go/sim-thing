import {
  findCarrierId,
  isBodyInWorld,
  type Agent,
  type Entity,
  type EntityLocation,
  type GodAction,
  type GodDestination,
  type Position,
} from "@village/shared";
import { config } from "../config";
import {
  createEntity,
  findEntityIfPresent,
  listContents,
  locateInside,
  moveEntity,
  removeEntity,
} from "../items/entity-store";
import { createThingEvent, type ThingRef } from "../items/things";
import { describePlace } from "../memory/filing";
import { isDead } from "../status/health";
import { findPlaceAt } from "../world/map-loader";
import { isWalkable } from "../world/pathfinding";
import { stopCurrentAction } from "./action-stopping";
import { getAgentRuntime, requestDecision, type VerbRun } from "./agent-runtime";
import { broadcastEvent, type BroadcastOptions } from "./event-broadcast";
import type { EventFields } from "./event-factory";
import type { TickContext } from "./tick-context";
import { cancelRunningVerb } from "./verb-runner";
import {
  appendToStream,
  buildWalkingGridFor,
  findAgent,
  listLivingAgents,
  markAgentChanged,
  markEntityChanged,
  markEntityRemoved,
  replaceAgent,
} from "./world-access";

function announce(
  context: TickContext,
  thing: ThingRef,
  fields: EventFields,
  options?: BroadcastOptions,
): void {
  const event = createThingEvent(context.state, thing, fields);
  if (event !== null) broadcastEvent(context.state, event, context.result, options);
}

function findBodyInWorld(context: TickContext, agentId: string): Agent | undefined {
  const agent = context.state.agents.find((candidate) => candidate.id === agentId);
  return agent && isBodyInWorld(agent) ? agent : undefined;
}

/** A thing others can see go: one on a tile, or in someone's hands, but not one in a chest. */
function isOutInTheOpen(entity: Entity): boolean {
  return entity.location.kind === "tile" || findCarrierId(entity) !== null;
}

/** The entity and everything inside it, however deep. */
function collectWithContents(context: TickContext, entity: Entity): Entity[] {
  const inside = listContents(context.state, entity.id);
  return [entity, ...inside.flatMap((content) => collectWithContents(context, content))];
}

function usesAnyOf(verbRun: VerbRun, entityIds: ReadonlySet<string>): boolean {
  const refersTo = (thing: VerbRun["target"]) =>
    thing?.kind === "entity" && entityIds.has(thing.entityId);
  return (
    verbRun.itemIds.some((itemId) => entityIds.has(itemId)) ||
    refersTo(verbRun.target) ||
    refersTo(verbRun.from)
  );
}

/** Whoever is busy with the entities, or is one of them (a creature), stops: a sleeper's bed is gone. */
function stopUsersOf(context: TickContext, entities: readonly Entity[]): void {
  const { state } = context;
  const entityIds = new Set(entities.map((entity) => entity.id));
  for (const agent of listLivingAgents(state)) {
    const verbRun = getAgentRuntime(state, agent.id).verbRun;
    if (verbRun !== null && usesAnyOf(verbRun, entityIds)) stopCurrentAction(context, agent.id);
  }
  for (const [creatureId, runtime] of Object.entries(state.creatureRuntimes)) {
    const verbRun = runtime.verbRun;
    if (verbRun === null) continue;
    if (entityIds.has(creatureId) || usesAnyOf(verbRun, entityIds)) {
      cancelRunningVerb(context, creatureId);
    }
  }
}

function resolveDestination(
  context: TickContext,
  destination: GodDestination,
): EntityLocation | string {
  const { state } = context;
  if (destination.kind === "agent") {
    if (!findBodyInWorld(context, destination.agentId)) {
      return `No one with id "${destination.agentId}" is in the world`;
    }
    return locateInside(destination.agentId);
  }
  const { pos } = destination;
  if (!isWalkable(state.map.grid, pos)) return "That tile is a wall or off the map";
  return { kind: "tile", place: findPlaceAt(state.map, pos), pos: { ...pos } };
}

function moveAgent(context: TickContext, agentId: string, pos: Position): string | null {
  const { state, result } = context;
  const agent = findBodyInWorld(context, agentId);
  if (!agent) return `No one with id "${agentId}" is in the world`;
  if (!isWalkable(buildWalkingGridFor(state, agentId), pos)) {
    return "That tile is blocked or someone is standing there";
  }
  const isLiving = !isDead(agent);
  const words = config.godMode;
  const thing: ThingRef = { kind: "agent", agentId };
  if (isLiving) stopCurrentAction(context, agentId);
  announce(
    context,
    thing,
    { kind: "vanished", description: words.vanishedDescription },
    { unperceivedBy: [agentId] },
  );
  const place = findPlaceAt(state.map, pos);
  replaceAgent(state, { ...findAgent(state, agentId), pos: { ...pos }, place, bodyHolderId: null });
  result.moves.push({ agentId, pos: { ...pos }, place });
  markAgentChanged(result, agentId);
  announce(context, thing, {
    kind: "appeared",
    description: words.appearedDescription,
    actorDescription: words.movedOwnDescription.split("{place}").join(describePlace(place)),
  });
  if (isLiving) requestDecision(getAgentRuntime(state, agentId), words.movedDecisionReason, true);
  return null;
}

function placeEntity(
  context: TickContext,
  definitionId: string,
  destination: GodDestination,
): string | null {
  const { state, result } = context;
  const isKnown = state.items.file.definitions.some((definition) => definition.id === definitionId);
  if (!isKnown) return `There is no item definition "${definitionId}"`;
  const location = resolveDestination(context, destination);
  if (typeof location === "string") return location;
  const entity = createEntity(state, definitionId, location);
  markEntityChanged(result, entity.id);
  announce(
    context,
    { kind: "entity", entityId: entity.id },
    { kind: "appeared", description: config.godMode.appearedDescription },
  );
  return null;
}

function moveExistingEntity(
  context: TickContext,
  entityId: string,
  destination: GodDestination,
): string | null {
  const { state, result } = context;
  const entity = findEntityIfPresent(state, entityId);
  if (!entity) return `There is no entity "${entityId}"`;
  const location = resolveDestination(context, destination);
  if (typeof location === "string") return location;
  const thing: ThingRef = { kind: "entity", entityId };
  const words = config.godMode;
  stopUsersOf(context, collectWithContents(context, entity));
  if (isOutInTheOpen(entity)) {
    announce(context, thing, { kind: "vanished", description: words.vanishedDescription });
  }
  moveEntity(state, entityId, location);
  markEntityChanged(result, entityId);
  announce(context, thing, { kind: "appeared", description: words.appearedDescription });
  return null;
}

function deleteEntity(context: TickContext, entityId: string): string | null {
  const { state, result } = context;
  const entity = findEntityIfPresent(state, entityId);
  if (!entity) return `There is no entity "${entityId}"`;
  const removed = collectWithContents(context, entity);
  stopUsersOf(context, removed);
  if (isOutInTheOpen(entity)) {
    announce(
      context,
      { kind: "entity", entityId },
      { kind: "vanished", description: config.godMode.vanishedDescription },
    );
  }
  for (const gone of removed) {
    removeEntity(state, gone.id);
    markEntityRemoved(result, gone.id);
  }
  return null;
}

/**
 * Every living agent hears the viewer's words, wherever they are and even asleep, and decides at
 * once. It goes straight into each stream rather than through perception: the voice has no
 * speaker in the world, so there is no one to see, hear from a direction, or talk back to.
 */
function speakToAll(context: TickContext, words: string): string | null {
  const { state, result } = context;
  const spoken = words.trim();
  if (spoken === "") return "Say something first";
  const godWords = config.godMode;
  const heard = godWords.voiceHeardDescription.split("{words}").join(spoken);
  for (const agent of listLivingAgents(state)) {
    appendToStream(state, agent.id, heard);
    markAgentChanged(result, agent.id);
    requestDecision(getAgentRuntime(state, agent.id), godWords.voiceDecisionReason, true);
  }
  return null;
}

/**
 * Applies a change the viewer made by hand to the paused world. Whoever sees it happen takes it in
 * as a thing vanishing or appearing; a moved person finds themselves elsewhere and decides anew;
 * spoken words reach everyone as a voice from the sky.
 * Returns why nothing was changed, or null once it was.
 */
export function applyGodAction(context: TickContext, action: GodAction): string | null {
  switch (action.kind) {
    case "move_agent":
      return moveAgent(context, action.agentId, action.pos);
    case "place_entity":
      return placeEntity(context, action.definitionId, action.destination);
    case "move_entity":
      return moveExistingEntity(context, action.entityId, action.destination);
    case "delete_entity":
      return deleteEntity(context, action.entityId);
    case "speak":
      return speakToAll(context, action.words);
  }
}
